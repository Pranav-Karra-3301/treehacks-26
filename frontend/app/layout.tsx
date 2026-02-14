import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'kiru — AI-powered negotiation',
  description: 'Your AI negotiates bills, prices, and contracts on your behalf. Just tell it what you want.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-950 font-sans">
        {children}
      </body>
    </html>
  );
}
