import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Research Agent',
  description: 'Deep research powered by AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="min-h-screen bg-gray-50">
          {children}
        </main>
        <footer className="py-6 px-4 text-center text-sm text-gray-500">
          <p>Powered by OpenAI and Firecrawl</p>
        </footer>
      </body>
    </html>
  );
} 