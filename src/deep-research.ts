import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';

import { o3MiniModel, trimPrompt } from './ai/providers';
import { systemPrompt } from './prompt';
import { executeWithRateLimitRetry } from './retryFirecrawl';
import { ProgressManager } from './progress-manager';

// Initialize progress manager for coordinated progress display
const progress = new ProgressManager();

export const Metrics = {
  startTime: Date.now(),
  openAiCalls: 0,
  firecrawlCalls: 0,
};

export type LearningDetail = {
  learning: string;
  sourceUrl: string;
};

export type ContributionDetail = {
  query: string;
  researchGoal: string;
  learnings: LearningDetail[];
  sourceUrls: string[];
  subContributions?: ContributionDetail[];
};

export type ResearchProgress = {
  currentDepth: number;
  totalDepth: number;
  currentBreadth: number;
  totalBreadth: number;
  currentQuery?: string;
  totalQueries: number;
  completedQueries: number;
};

type ResearchResult = {
  learnings: LearningDetail[];
  visitedUrls: string[];
  breakdown: ContributionDetail[];
};

// increase this if you have higher API rate limits
const ConcurrencyLimit = 2;

// Initialize Firecrawl with optional API key and optional base url
const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

// take en user query, return a list of SERP queries
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
}: {
  query: string;
  numQueries?: number;
  learnings?: LearningDetail[];
}) {
  Metrics.openAiCalls++;
  
  const res = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Given the following prompt from the user, generate a list of SERP queries to research the topic. Return a maximum of ${numQueries} queries, but feel free to return less if the original prompt is clear. Make sure each query is unique and not similar to each other: <prompt>${query}</prompt>\n\n${
      learnings
        ? `Here are some learnings from previous research, use them to generate more specific queries: ${learnings.map(l => l.learning).join(
            '\n',
          )}`
        : ''
    }`,
    schema: z.object({
      queries: z
        .array(
          z.object({
            query: z.string().describe('The SERP query'),
            researchGoal: z
              .string()
              .describe(
                'First talk about the goal of the research that this query is meant to accomplish, then go deeper into how to advance the research once the results are found, mention additional research directions. Be as specific as possible, especially for additional research directions.',
              ),
          }),
        )
        .describe(`List of SERP queries, max of ${numQueries}`),
    }),
  });
  console.log(
    `Created ${res.object.queries.length} queries`,
    res.object.queries,
  );

  return res.object.queries.slice(0, numQueries);
}

async function processSerpResult({
  query,
  result,
  numFollowUpQuestions = 3,
}: {
  query: string;
  result: SearchResponse;
  numLearnings?: number;
  numFollowUpQuestions?: number;
}) {
  // Create an array of content objects with their associated URLs
  const contentDetails = compact(result.data.map(item => {
    if (!item.markdown || !item.url) return null;
    return { url: item.url, content: trimPrompt(item.markdown, 25_000) };
  }));

  console.log(`Ran ${query}, found ${contentDetails.length} content items`);

  // Generate a learning for each content item individually
  const detailedLearnings = await Promise.all(
    contentDetails.map(detail =>
      generateLearningForContent(detail.content, detail.url)
    )
  );

  // Generate follow-up questions using aggregated content
  const aggregatedContents = contentDetails
    .map(cd => `<content>\n${cd.content}\n</content>`)
    .join('\n');
  const followUpRes = await generateObject({
    model: o3MiniModel,
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: `Given the aggregated contents from a SERP search for the query <query>${query}</query>, generate a list of follow-up questions to further research the topic:\n\n<contents>\n${aggregatedContents}\n</contents>`,
    schema: z.object({
      followUpQuestions: z.array(z.string()).describe(`List of follow-up questions`),
    }),
  });

  console.log(`Created ${detailedLearnings.length} learnings from individual contents`);
  return {
    learnings: detailedLearnings,
    followUpQuestions: followUpRes.object.followUpQuestions,
  };
}

async function generateLearningForContent(content: string, url: string): Promise<LearningDetail> {
  Metrics.openAiCalls++;
  const res = await generateObject({
    model: o3MiniModel,
    abortSignal: AbortSignal.timeout(60_000),
    system: systemPrompt(),
    prompt: `Given the following content fetched from <url>${url}</url>, extract a concise yet detailed learning. Include key entities, metrics, and dates if present.\n\n<content>\n${content}\n</content>`,
    schema: z.object({
      learning: z.string().describe('Extracted learning from the individual content'),
    }),
  });
  return { learning: res.object.learning, sourceUrl: url };
}

export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
}: {
  prompt: string;
  learnings: LearningDetail[];
  visitedUrls: string[];
}) {
  // Create a map of URLs to citation numbers
  const urlToCitation = new Map<string, number>();
  visitedUrls.forEach((url, index) => {
    urlToCitation.set(url, index + 1);
  });

  // Format each learning with its numbered citation
  const learningsString = trimPrompt(
    learnings
      .map(ld => `<learning>\n${ld.learning} [${urlToCitation.get(ld.sourceUrl)}]\n</learning>`)
      .join('\n'),
    150_000,
  );

  const res = await generateObject({
    model: o3MiniModel,
    system: systemPrompt(),
    prompt: `Given the following prompt from the user, write a final report on the topic using the learnings below. The report should be detailed (at least 3 pages) and include all learnings with their numbered citations (e.g. [1], [2], etc.) inline where appropriate. Each fact or learning should be followed by its citation number in square brackets.\n\n<prompt>${prompt}</prompt>\n\nLearnings:\n\n<learnings>\n${learningsString}\n</learnings>`,
    schema: z.object({
      reportMarkdown: z.string().describe('Final report on the topic in Markdown'),
    }),
  });

  // Create a numbered reference list
  const referencesSection = `\n\n## References\n\n${visitedUrls
    .map((url, index) => `${index + 1}. ${url}`)
    .join('\n')}`;

  return res.object.reportMarkdown + referencesSection;
}

export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
  onProgress,
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: LearningDetail[];
  visitedUrls?: string[];
  onProgress?: (progress: ResearchProgress) => void;
}): Promise<ResearchResult> {
  const currentProgress: ResearchProgress = {
    currentDepth: depth,
    totalDepth: depth,
    currentBreadth: breadth,
    totalBreadth: breadth,
    totalQueries: 0,
    completedQueries: 0,
  };
  
  const reportProgress = (update: Partial<ResearchProgress>) => {
    Object.assign(currentProgress, update);
    onProgress?.(currentProgress);
    progress.updateProgress(currentProgress);
  };

  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
  });
  
  reportProgress({
    totalQueries: serpQueries.length,
    currentQuery: serpQueries[0]?.query
  });
  
  const limit = pLimit(ConcurrencyLimit);

  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      limit(async () => {
        try {
          const result = await firecrawl.search(serpQuery.query, {
            timeout: 15000,
            limit: 5,
            scrapeOptions: { formats: ['markdown'] },
          });

          // Collect URLs from this search
          const newUrls = compact(result.data.map(item => item.url));
          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;

          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          const contribution: ContributionDetail = {
            query: serpQuery.query,
            researchGoal: serpQuery.researchGoal,
            learnings: newLearnings.learnings,
            sourceUrls: newUrls,
          };

          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            reportProgress({
              currentDepth: newDepth,
              currentBreadth: newBreadth,
              completedQueries: currentProgress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });

            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            const deeperResult = await deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
              onProgress,
            });

            contribution.subContributions = deeperResult.breakdown;

            return deeperResult;
          } else {
            reportProgress({
              currentDepth: 0,
              completedQueries: currentProgress.completedQueries + 1,
              currentQuery: serpQuery.query,
            });
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
              breakdown: [contribution],
            };
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Timeout')) {
            console.log(
              `Timeout error running query: ${serpQuery.query}: `,
              e,
            );
          } else {
            console.log(`Error running query: ${serpQuery.query}: `, e);
          }
          return {
            learnings: [],
            visitedUrls: [],
            breakdown: [],
          };
        }
      }),
    ),
  );

  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
    breakdown: results.flatMap(r => r.breakdown),
  };
}

export function getMetricsReport() {
  const elapsedTimeMs = Date.now() - Metrics.startTime;
  return {
    elapsedTimeMs,
    elapsedTimeFormatted: `${(elapsedTimeMs / 1000).toFixed(2)}s`,
    openAiCalls: Metrics.openAiCalls,
    firecrawlCalls: Metrics.firecrawlCalls,
  };
}

// Add cleanup function for the progress display
export function cleanup() {
  progress.stop();
}
