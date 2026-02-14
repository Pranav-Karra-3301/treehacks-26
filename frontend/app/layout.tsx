import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="card p-4 animate-pop">
            <h1 className="text-2xl font-bold">NegotiateAI</h1>
            <p className="text-sm text-[var(--muted)]">Local AI negotiator demo on DGX Spark + Twilio + Deepgram</p>
            <nav className="mt-3 flex gap-4 text-sm">
              <Link href="/">New Task</Link>
              <Link href="/history">History</Link>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
