import { NextResponse } from 'next/server';
import { z } from 'zod';

import { deepResearch, writeFinalReport } from '../../../deep-research';
import { generateFeedback } from '../../../feedback';

const researchSchema = z.object({
  query: z.string().min(1),
  breadth: z.number().min(1).max(10),
  depth: z.number().min(1).max(5),
  feedback: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, breadth, depth, feedback } = researchSchema.parse(body);

    // If no additional feedback is provided, generate follow-up questions
    if (!feedback || feedback.trim() === '') {
      const questions = await generateFeedback({ query });
      return NextResponse.json({ questions });
    }

    // Combine query and feedback for better context
    const combinedQuery = `
      Research Topic: ${query}
      Additional Context: ${feedback}
    `.trim();

    // Perform the deep research process
    const { learnings, visitedUrls } = await deepResearch({
      query: combinedQuery,
      breadth,
      depth,
    });

    // Generate the final report
    const report = await writeFinalReport({
      prompt: combinedQuery,
      learnings,
      visitedUrls,
    });

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Research error:', error);
    return NextResponse.json(
      { error: 'Failed to process research request' },
      { status: 500 },
    );
  }
} 