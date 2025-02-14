import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as fs from 'fs/promises';

import { deepResearch, writeFinalReport, cleanup, ResearchProgress, ContributionDetail, LearningDetail } from '../../../deep-research';
import { generateFeedback } from '../../../feedback';

const researchSchema = z.object({
  query: z.string().min(1),
  breadth: z.number().min(1).max(10),
  depth: z.number().min(1).max(5),
  feedback: z.string().optional(),
});

type ProgressUpdate = {
  type: 'progress';
  data: ResearchProgress;
};

type ResultUpdate = {
  type: 'result';
  data: {
    report: string;
    learnings: LearningDetail[];
    visitedUrls: string[];
    breakdown: ContributionDetail[];
  };
};

type ErrorUpdate = {
  type: 'error';
  error: string;
};

export type ResearchUpdate = ProgressUpdate | ResultUpdate | ErrorUpdate;

/**
 * GET handler to support streaming research progress when a GET request is sent.
 */
export async function GET(request: Request) {
  // Parse query parameters from the URL
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const breadth = Number(searchParams.get('breadth'));
  const depth = Number(searchParams.get('depth'));
  const feedback = searchParams.get('feedback');

  try {
    // Validate parameters using our schema
    const { query: validQuery, breadth: validBreadth, depth: validDepth, feedback: validFeedback } = researchSchema.parse({
      query,
      breadth,
      depth,
      feedback,
    });

    // If no feedback is provided, generate follow-up questions and return immediately.
    if (!validFeedback) {
      const questions = await generateFeedback({ query: validQuery });
      return NextResponse.json({ questions });
    }

    // Create a TransformStream for sending progress updates
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const response = new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Helper function to send updates through the stream
    const sendUpdate = async (update: ResearchUpdate) => {
      try {
        const data = JSON.stringify(update);
        await writer.write(new TextEncoder().encode(`data: ${data}\n\n`));
      } catch (e) {
        console.error('Error sending update:', e);
      }
    };

    // Combine query and feedback for better context
    const combinedQuery = `Research Topic: ${validQuery}\nAdditional Context: ${validFeedback}`.trim();

    // Start the research process in the background
    (async () => {
      try {
        // Perform the deep research process with progress tracking
        const researchResult = await deepResearch({
          query: combinedQuery,
          breadth: validBreadth,
          depth: validDepth,
          onProgress: (progress) => {
            sendUpdate({
              type: 'progress',
              data: progress,
            });
          },
        });

        // Generate the final report
        const report = await writeFinalReport({
          prompt: combinedQuery,
          learnings: researchResult!.learnings,
          visitedUrls: researchResult!.visitedUrls,
        });

        // Save the report to a Markdown file.
        // First, try to extract a title from the report (assumes first markdown header is the title)
        const titleMatch = report.match(/^#\s+(.*)/m);
        const titleForFile = titleMatch?.[1]?.trim() || validQuery;
        // Create a safe filename by replacing non-alphanumeric characters. You can also append a timestamp if needed.
        const safeReportName = titleForFile.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const filename = `${safeReportName || 'report'}.md`;
        await fs.writeFile(filename, report, 'utf-8');
        console.log(`Report saved as ${filename}`);

        // Send the final result
        await sendUpdate({
          type: 'result',
          data: {
            report,
            learnings: researchResult.learnings,
            visitedUrls: researchResult.visitedUrls,
            breakdown: researchResult.breakdown,
          },
        });
      } catch (error) {
        await sendUpdate({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      } finally {
        cleanup();
        await writer.close();
      }
    })();

    return response;
  } catch (error) {
    console.error('Research error:', error);
    cleanup();
    return NextResponse.json({ error: 'Failed to process research request' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  // Create an AbortController to handle client disconnection
  const controller = new AbortController();
  const { signal } = controller;

  try {
    const body = await request.json();
    const { query, breadth, depth, feedback } = researchSchema.parse(body);

    // If no feedback is provided, generate follow-up questions
    if (!feedback) {
      const questions = await generateFeedback({ query });
      return NextResponse.json({ questions });
    }

    // Create a TransformStream for sending progress updates
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Start the response
    const response = new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    // Function to send updates through the stream
    const sendUpdate = async (update: ResearchUpdate) => {
      try {
        const data = JSON.stringify(update);
        await writer.write(new TextEncoder().encode(`data: ${data}\n\n`));
      } catch (e) {
        console.error('Error sending update:', e);
      }
    };

    // Handle client disconnection
    signal.addEventListener('abort', () => {
      cleanup();
      writer.close();
    });

    // Combine query and feedback for better context
    const combinedQuery = `Research Topic: ${query}\nAdditional Context: ${feedback}`.trim();

    // Start the research process in the background
    (async () => {
      try {
        const researchResult = await deepResearch({
          query: combinedQuery,
          breadth,
          depth,
          onProgress: (progress) => {
            sendUpdate({
              type: 'progress',
              data: progress,
            });
          },
        });

        // Generate the final report
        const report = await writeFinalReport({
          prompt: combinedQuery,
          learnings: researchResult!.learnings,
          visitedUrls: researchResult!.visitedUrls,
        });

        // Save the report to a Markdown file.
        // Extract the title from the report (if available) or fallback to the research query.
        const titleMatch = report.match(/^#\s+(.*)/m);
        const titleForFile = titleMatch?.[1]?.trim() || query;
        const safeReportName = titleForFile.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const filename = `${safeReportName || 'report'}.md`;
        await fs.writeFile(filename, report, 'utf-8');
        console.log(`Report saved as ${filename}`);

        // Send the final result
        await sendUpdate({
          type: 'result',
          data: {
            report,
            learnings: researchResult.learnings,
            visitedUrls: researchResult.visitedUrls,
            breakdown: researchResult.breakdown,
          },
        });
      } catch (error) {
        await sendUpdate({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      } finally {
        cleanup();
        await writer.close();
      }
    })();

    return response;
  } catch (error) {
    console.error('Research error:', error);
    cleanup();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process research request' },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
} 