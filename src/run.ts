import * as fs from 'fs/promises';
import * as readline from 'readline';

import { deepResearch, writeFinalReport, cleanup } from './deep-research';
import { generateFeedback } from './feedback';
import { ProgressManager } from './progress-manager';

const progress = new ProgressManager();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// run the agent
async function run() {
  try {
    // Get initial query
    const initialQuery = await askQuestion('What would you like to research? ');

    // Get breath and depth parameters
    const breadth =
      parseInt(
        await askQuestion(
          'Enter research breadth (recommended 2-10, default 4): ',
        ),
        10,
      ) || 4;
    const depth =
      parseInt(
        await askQuestion('Enter research depth (recommended 1-5, default 2): '),
        10,
      ) || 2;

    console.log(`Creating research plan...`);

    // Generate follow-up questions
    const followUpQuestions = await generateFeedback({
      query: initialQuery,
    });

    console.log(
      '\nTo better understand your research needs, please answer these follow-up questions:',
    );

    // Collect answers to follow-up questions
    const answers: string[] = [];
    for (const question of followUpQuestions) {
      const answer = await askQuestion(`\n${question}\nYour answer: `);
      answers.push(answer);
    }

    // Combine all information for deep research
    const combinedQuery = `
Initial Query: ${initialQuery}
Follow-up Questions and Answers:
${followUpQuestions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
`;

    console.log('\nResearching your topic...');

    console.log('\nStarting research with progress tracking...\n');
    
    const { learnings, visitedUrls } = await deepResearch({
      query: combinedQuery,
      breadth,
      depth,
      onProgress: (progressUpdate) => {
        progress.updateProgress(progressUpdate);
      },
    });

    console.log(`\n\nLearnings:\n\n${learnings.join('\n')}`);
    console.log(
      `\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`,
    );
    console.log('Writing final report...');

    const report = await writeFinalReport({
      prompt: combinedQuery,
      learnings,
      visitedUrls,
    });

    // Save report to file
    await fs.writeFile('output.md', report, 'utf-8');

    console.log(`\n\nFinal Report:\n\n${report}`);
    console.log('\nReport has been saved to output.md');
  } finally {
    cleanup(); // Ensure progress display is cleaned up
    rl.close();
  }
}

run().catch(error => {
  console.error(error);
  cleanup(); // Ensure progress display is cleaned up even on error
  rl.close();
  process.exit(1);
});
