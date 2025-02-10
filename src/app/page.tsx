'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

type Step = 'home' | 'feedback' | 'loading' | 'report';

export default function Home() {
  const [step, setStep] = useState<Step>('home');
  const [query, setQuery] = useState('');
  const [breadth, setBreadth] = useState(3);
  const [depth, setDepth] = useState(2);
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);
  const [feedbackAnswers, setFeedbackAnswers] = useState<string[]>([]);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');

  // Handler to start research: fetch follow-up questions
  const startResearch = async () => {
    if (!query.trim()) {
      setError('Please enter a research topic');
      return;
    }
    setError('');
    try {
      // Call the API with an empty feedback field to get questions
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, breadth, depth, feedback: '' }),
      });
      if (!response.ok) {
        throw new Error('Failed to generate follow-up questions');
      }
      const data = await response.json();
      // Expected response includes a questions array
      setGeneratedQuestions(data.questions || []);
      // Initialize feedbackAnswers based on the number of questions
      setFeedbackAnswers(data.questions.map(() => ''));
      setStep('feedback');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Update corresponding feedback answer for each question
  const handleFeedbackChange = (index: number, value: string) => {
    const updatedAnswers = [...feedbackAnswers];
    updatedAnswers[index] = value;
    setFeedbackAnswers(updatedAnswers);
  };

  // Submit the feedback; combine responses and trigger deep research
  const submitFeedback = async () => {
    setStep('loading');
    const formattedFeedback = generatedQuestions
      .map((q, i) => `Q: ${q}\nA: ${feedbackAnswers[i] || ''}`)
      .join('\n\n');
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, breadth, depth, feedback: formattedFeedback }),
      });
      if (!response.ok) {
        throw new Error('Research request failed');
      }
      const data = await response.json();
      setReport(data.report);
      setStep('report');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('home');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {step === 'home' && (
        <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-semibold text-center mb-6">
            AI Research Agent
          </h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Research Topic
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="text"
                placeholder="Enter your research topic"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Breadth
                </label>
                <input
                  type="number"
                  value={breadth}
                  onChange={(e) => setBreadth(Number(e.target.value))}
                  min="1"
                  max="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Depth
                </label>
                <input
                  type="number"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                  min="1"
                  max="5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={startResearch}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Start Research
            </button>
          </div>
        </div>
      )}

      {step === 'feedback' && (
        <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Follow-Up Questions</h2>
          <div className="space-y-4">
            {generatedQuestions.map((question, index) => (
              <div key={index}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {question}
                </label>
                <input
                  type="text"
                  placeholder="Your answer"
                  value={feedbackAnswers[index] || ''}
                  onChange={(e) => handleFeedbackChange(index, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep('home')}
              className="bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
            >
              Back
            </button>
            <button
              onClick={submitFeedback}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Submit Feedback
            </button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Researching your topic...</p>
        </div>
      )}

      {step === 'report' && (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold mb-6">Research Report</h2>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
          <button
            onClick={() => {
              setStep('home');
              setQuery('');
              setFeedbackAnswers([]);
              setGeneratedQuestions([]);
              setReport('');
              setError('');
            }}
            className="mt-6 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            New Research
          </button>
        </div>
      )}
    </div>
  );
} 