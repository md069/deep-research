'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

import { ContributionDetail, ResearchProgress } from '../../deep-research';

type Step = 'home' | 'questions' | 'researching' | 'report';

type ResearchState = {
  depth: {
    current: number;
    total: number;
  };
  breadth: {
    current: number;
    total: number;
  };
  queries: {
    completed: number;
    total: number;
  };
  currentQuery?: string;
};

function ContributionPanel({ contribution }: { contribution: ContributionDetail }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="contribution-container border border-slate-200/50 rounded-lg p-4 mb-4 bg-white/90 backdrop-blur-sm shadow-sm">
      <div
        className="header cursor-pointer flex items-start justify-between gap-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-grow">
          <div className="font-medium text-slate-900 mb-1">
            <span className="text-blue-600">Query:</span> {contribution.query}
          </div>
          <div className="text-sm text-slate-600">
            <span className="text-blue-500">Goal:</span> {contribution.researchGoal}
          </div>
        </div>
        <button className="flex-shrink-0 text-sm text-blue-600 hover:text-blue-700 focus:outline-none">
          {isExpanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      {isExpanded && (
        <div className="details mt-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Learnings:</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              {contribution.learnings.map((learning: string, idx: number) => (
                <li key={idx}>{learning}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Sources:</h4>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {contribution.sourceUrls.map((url: string, idx: number) => (
                <li key={idx}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 hover:underline break-all"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {contribution.subContributions && contribution.subContributions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">Sub-Research:</h4>
              <div className="pl-4 space-y-2">
                {contribution.subContributions.map((sub: ContributionDetail, idx: number) => (
                  <ContributionPanel key={idx} contribution={sub} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, total, label }: { value: number; total: number; label: string }) {
  const percentage = Math.round((value / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm text-slate-600">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ResearchProgress({ state }: { state: ResearchState }) {
  return (
    <div className="space-y-4">
      <ProgressBar
        label="Depth Progress"
        value={state.depth.total - state.depth.current}
        total={state.depth.total}
      />
      <ProgressBar
        label="Breadth Progress"
        value={state.breadth.total - state.breadth.current}
        total={state.breadth.total}
      />
      <ProgressBar
        label="Queries Completed"
        value={state.queries.completed}
        total={state.queries.total}
      />
      {state.currentQuery && (
        <div className="text-sm text-slate-600">
          <span className="font-medium">Current Query:</span> {state.currentQuery}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState<Step>('home');
  const [query, setQuery] = useState('');
  const [breadth, setBreadth] = useState(3);
  const [depth, setDepth] = useState(2);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [report, setReport] = useState('');
  const [learnings, setLearnings] = useState<string[]>([]);
  const [visitedUrls, setVisitedUrls] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [researchState, setResearchState] = useState<ResearchState>({
    depth: { current: 0, total: 0 },
    breadth: { current: 0, total: 0 },
    queries: { completed: 0, total: 0 },
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // Handler to start research and get follow-up questions
  const startResearch = async () => {
    if (!query.trim()) {
      setError('Please enter a research topic');
      return;
    }
    setError('');
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, breadth, depth }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate follow-up questions');
      }
      const data = await response.json();
      if (data.questions) {
        setQuestions(data.questions);
        setAnswers(new Array(data.questions.length).fill(''));
        setStep('questions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Handler to update answers
  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  // Handler to submit answers and start research
  const submitAnswers = async () => {
    setStep('researching');
    setError('');
    
    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const feedback = questions
        .map((q, i) => `Q: ${q}\nA: ${answers[i] || 'No answer provided'}`)
        .join('\n\n');

      // Create new EventSource for progress updates
      const es = new EventSource(`/api/research?${new URLSearchParams({
        query,
        breadth: breadth.toString(),
        depth: depth.toString(),
        feedback,
      }).toString()}`);
      
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const update = JSON.parse(event.data);
        
        switch (update.type) {
          case 'progress':
            const progress = update.data as ResearchProgress;
            setResearchState({
              depth: {
                current: progress.currentDepth,
                total: progress.totalDepth,
              },
              breadth: {
                current: progress.currentBreadth,
                total: progress.totalBreadth,
              },
              queries: {
                completed: progress.completedQueries,
                total: progress.totalQueries,
              },
              currentQuery: progress.currentQuery,
            });
            break;
          
          case 'result':
            setReport(update.data.report);
            setLearnings(update.data.learnings);
            setVisitedUrls(update.data.visitedUrls);
            setStep('report');
            es.close();
            break;
          
          case 'error':
            setError(update.error);
            setStep('home');
            es.close();
            break;
        }
      };

      es.onerror = () => {
        setError('Connection lost. Please try again.');
        setStep('home');
        es.close();
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('home');
    }
  };

  return (
    <div className="container mx-auto">
      {error && (
        <div className="mb-6 p-4 bg-red-50/90 backdrop-blur-sm text-red-700 rounded-lg shadow-sm border border-red-100/50 flex items-center">
          <svg className="w-5 h-5 mr-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {step === 'home' && (
        <div className="max-w-2xl mx-auto">
          <div className="relative bg-white/90 backdrop-blur-sm p-8 rounded-xl shadow-xl shadow-slate-200/40 transition-all border border-slate-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/80 to-sky-50/30 rounded-xl opacity-100" />
            <div className="relative">
              <div className="flex items-center justify-center mb-2">
                <svg className="w-10 h-10 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Research Assistant</h1>
              <p className="text-center text-slate-500 mb-12">Discover comprehensive insights through AI-powered research</p>
              
              <div className="space-y-8">
                <div className="group/field">
                  <label className="block text-sm font-medium text-slate-700 mb-2 group-hover/field:text-blue-600 transition-colors">
                    Research Topic
                  </label>
                  <div className="relative">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="What would you like to research? Be as specific as possible for better results."
                      rows={3}
                      className="w-full px-4 py-3 bg-white/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 resize-y min-h-[120px] group-hover/field:border-blue-100"
                    />
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-sky-500/5 opacity-0 group-hover/field:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="group/field relative">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2 group-hover/field:text-blue-600 transition-colors">
                      Research Breadth
                      <div className="relative">
                        <svg className="w-4 h-4 text-slate-400 group-hover/field:text-blue-400 transition-colors cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/field:opacity-100 group-hover/field:visible transition-all">
                          <p className="font-medium mb-1">Research Coverage</p>
                          <p className="text-slate-300">Higher values explore more diverse perspectives and sources. Recommended: 3-5</p>
                        </div>
                      </div>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={breadth}
                        onChange={(e) => setBreadth(Number(e.target.value))}
                        min="1"
                        max="10"
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all group-hover/field:border-blue-100"
                      />
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-sky-500/5 opacity-0 group-hover/field:opacity-100 transition-opacity pointer-events-none" />
                      <div className="mt-1.5 text-xs text-slate-500 group-hover/field:text-blue-500 transition-colors flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Recommended: 3-5
                      </div>
                    </div>
                  </div>

                  <div className="group/field relative">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2 group-hover/field:text-blue-600 transition-colors">
                      Research Depth
                      <div className="relative">
                        <svg className="w-4 h-4 text-slate-400 group-hover/field:text-blue-400 transition-colors cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 bg-slate-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/field:opacity-100 group-hover/field:visible transition-all">
                          <p className="font-medium mb-1">Research Thoroughness</p>
                          <p className="text-slate-300">Higher values provide more detailed analysis per topic. Recommended: 2-3</p>
                        </div>
                      </div>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                        min="1"
                        max="5"
                        className="w-full px-4 py-3 bg-white/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all group-hover/field:border-blue-100"
                      />
                      <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/5 to-sky-500/5 opacity-0 group-hover/field:opacity-100 transition-opacity pointer-events-none" />
                      <div className="mt-1.5 text-xs text-slate-500 group-hover/field:text-blue-500 transition-colors flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Recommended: 2-3
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-slate-50/50 backdrop-blur-sm p-5 rounded-lg border border-blue-100/50">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 mb-1">Research Parameters Guide</h3>
                      <div className="space-y-2 text-sm text-slate-600">
                        <p>
                          <strong className="text-slate-700">Research Breadth (1-10):</strong> Controls the scope of research. Higher values explore more perspectives but increase research time.
                        </p>
                        <p>
                          <strong className="text-slate-700">Research Depth (1-5):</strong> Controls analysis detail. Higher values provide more thorough insights but extend processing time.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={startResearch}
                  className="group w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-6 rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 transition-all font-medium shadow-lg shadow-blue-500/20"
                >
                  <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,blue_0deg,sky_120deg,indigo_240deg,blue_360deg)] opacity-0 group-hover:opacity-20 group-focus:opacity-40 transition-opacity animate-spin-slow" />
                  <span className="relative flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Begin Research
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'questions' && (
        <div className="max-w-2xl mx-auto">
          <div className="relative bg-white/90 backdrop-blur-sm p-8 rounded-xl shadow-xl shadow-slate-200/40 transition-all border border-slate-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/80 to-sky-50/30 rounded-xl opacity-100" />
            <div className="relative">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Follow-up Questions</h2>
              <p className="text-slate-600 mb-8">Please answer these questions to help refine the research direction:</p>
              
              <div className="space-y-6">
                {questions.map((question, idx) => (
                  <div key={idx} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">{question}</label>
                    <textarea
                      value={answers[idx]}
                      onChange={(e) => handleAnswerChange(idx, e.target.value)}
                      placeholder="Your answer..."
                      rows={3}
                      className="w-full px-4 py-3 bg-white/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 resize-y"
                    />
                  </div>
                ))}
                
                <div className="flex justify-end gap-4">
                  <button
                    onClick={() => setStep('home')}
                    className="px-6 py-2 text-slate-600 hover:text-slate-700 focus:outline-none"
                  >
                    Back
                  </button>
                  <button
                    onClick={submitAnswers}
                    className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2 px-6 rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 transition-all font-medium"
                  >
                    <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,blue_0deg,sky_120deg,indigo_240deg,blue_360deg)] opacity-0 group-hover:opacity-20 group-focus:opacity-40 transition-opacity animate-spin-slow" />
                    <span className="relative">Start Research</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'researching' && (
        <div className="max-w-2xl mx-auto">
          <div className="relative bg-white/90 backdrop-blur-sm p-8 rounded-xl shadow-xl shadow-slate-200/40 transition-all border border-slate-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/80 to-sky-50/30 rounded-xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 to-sky-600 animate-pulse opacity-20" />
                  <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-100/80 rounded-full" />
                  <div className="absolute top-0 left-0 w-full h-full border-4 border-blue-600 rounded-full border-t-transparent animate-spin" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Researching your topic...</h2>
                  <p className="text-sm text-slate-500">This may take a few minutes</p>
                </div>
              </div>
              
              <ResearchProgress state={researchState} />
            </div>
          </div>
        </div>
      )}

      {step === 'report' && (
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-white/90 backdrop-blur-sm p-8 sm:p-10 rounded-xl shadow-xl shadow-slate-200/40 transition-all border border-slate-200/50">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 via-white/80 to-sky-50/30 rounded-xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-8 h-8 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">Research Report</h2>
              </div>
              <p className="text-slate-500 mb-8">Here's what we found based on your query</p>
              
              <div className="prose prose-lg max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-blue-600 hover:prose-a:text-blue-700 prose-strong:text-slate-700 prose-code:text-blue-600 prose-pre:bg-slate-50/50 prose-pre:backdrop-blur-sm prose-img:rounded-lg prose-hr:border-slate-200">
                <ReactMarkdown>{report}</ReactMarkdown>
              </div>
              
              <div className="mt-8 space-y-6">
                <div className="bg-slate-50/50 backdrop-blur-sm rounded-lg p-6 border border-slate-200/50">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Key Learnings</h3>
                  <ul className="space-y-2">
                    {learnings.map((learning, idx) => (
                      <li key={idx} className="flex gap-2 text-slate-700">
                        <span className="text-blue-600">•</span>
                        {learning}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="bg-slate-50/50 backdrop-blur-sm rounded-lg p-6 border border-slate-200/50">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Sources</h3>
                  <ul className="space-y-2">
                    {visitedUrls.map((url, idx) => (
                      <li key={idx}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 hover:underline break-all"
                        >
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-10 flex justify-center">
                <button
                  onClick={() => {
                    setStep('home');
                    setQuery('');
                    setReport('');
                    setLearnings([]);
                    setVisitedUrls([]);
                    setError('');
                    setResearchState({
                      depth: { current: 0, total: 0 },
                      breadth: { current: 0, total: 0 },
                      queries: { completed: 0, total: 0 },
                    });
                  }}
                  className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-8 rounded-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 transition-all font-medium shadow-lg shadow-blue-500/20"
                >
                  <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,blue_0deg,sky_120deg,indigo_240deg,blue_360deg)] opacity-0 group-hover:opacity-20 group-focus:opacity-40 transition-opacity animate-spin-slow" />
                  <span className="relative flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    New Research
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 