import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as fs from 'fs/promises';
import crypto from 'crypto';

import { deepResearch, writeFinalReport, cleanup, ResearchProgress, ContributionDetail, LearningDetail } from '../../../deep-research';
import { generateFeedback } from '../../../feedback';

const researchSchema = z.object({
  query: z.string().min(1),
  breadth: z.number().min(1).max(10),
  depth: z.number().min(1).max(5),
  feedback: z.string().optional(),
});

export type ResearchUpdate = 
  | { type: 'progress'; data: ResearchProgress }
  | { type: 'result'; data: { report: string; learnings: LearningDetail[]; visitedUrls: string[]; breakdown: ContributionDetail[] } }
  | { type: 'error'; error: string };

// Global in‑memory store for research requests
const researchStore = new Map<string, { query: string; breadth: number; depth: number; feedback: string }>();

/**
 * GET handler to support streaming research progress when a researchId is provided.
 */
export async function GET(request: Request) {
  // Parse query parameters from the URL
  const { searchParams } = new URL(request.url);
  
  // Check for researchId
  const researchId = searchParams.get('researchId');
  if (researchId) {
    const stored = researchStore.get(researchId);
    if (!stored) {
      return NextResponse.json({ error: 'Invalid research ID' }, { status: 400 });
    }
    // Remove the stored request once retrieved
    researchStore.delete(researchId);
    
    const validQuery = stored.query;
    const validBreadth = stored.breadth;
    const validDepth = stored.depth;
    const validFeedback = stored.feedback;
    
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

    // Start the research process!
    (async () => {
      try {
        const researchResult = await deepResearch({
          query: combinedQuery,
          breadth: validBreadth,
          depth: validDepth,
          onProgress: (progress) => {
            sendUpdate({ type: 'progress', data: progress });
          },
        });

        const report = await writeFinalReport({
          prompt: combinedQuery,
          learnings: researchResult!.learnings,
          visitedUrls: researchResult!.visitedUrls,
        });

        // Save the report to a Markdown file.
        const titleMatch = report.match(/^#\s+(.*)/m);
        const titleForFile = titleMatch?.[1]?.trim() || validQuery;
        const safeReportName = titleForFile.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const filename = `${safeReportName || 'report'}.md`;
        try {
          await fs.writeFile(filename, report, 'utf-8');
          console.log(`Report saved as ${filename}`);
        } catch (writeError) {
          console.warn('Failed to write report file:', writeError);
        }

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
  }
  
  // Fallback if researchId is missing
  return NextResponse.json({ error: 'Missing researchId parameter' }, { status: 400 });
}

/**
 * POST handler.  
 * If no feedback provided, returns follow‑up questions.  
 * Otherwise, generates a short research ID and stores the research request.
 */
export async function POST(request: Request) {
  // Create an AbortController to handle client disconnection
  const controller = new AbortController();
  const { signal } = controller;

  try {
    const body = await request.json();
    const { query, breadth, depth, feedback } = researchSchema.parse(body);

    // If no feedback is provided, generate follow‑up questions
    if (!feedback || feedback.trim() === "") {
      const questions = await generateFeedback({ query });
      return NextResponse.json({ questions });
    }
    
    // Feedback is provided.
    // Generate an 8-character random hex string
    const randomPart = crypto.randomBytes(4).toString('hex'); // 8 hex characters
    // Take the first 10 characters of the query (remove whitespace for safety)
    const prefix = query.substring(0, 10).replace(/\s/g, '');
    const researchId = `${randomPart}_${prefix}`;

    // Store the research request parameters in memory.
    researchStore.set(researchId, { query, breadth, depth, feedback });

    return NextResponse.json({ researchId });
  } catch (error) {
    console.error('Research error:', error);
    cleanup();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process research request' },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
} 