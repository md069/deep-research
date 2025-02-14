import { NextResponse } from 'next/server';
import { z } from 'zod';

import { deepResearch, writeFinalReport, cleanup, ResearchProgress, ContributionDetail } from '../../../deep-research';
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
    learnings: string[];
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
          learnings: researchResult.learnings,
          visitedUrls: researchResult.visitedUrls,
        });

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
          learnings: researchResult.learnings,
          visitedUrls: researchResult.visitedUrls,
        });

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