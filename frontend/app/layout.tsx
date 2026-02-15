import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://kiru.chat'),
  title: 'kiru - AI-powered negotiation',
  description: 'Your AI negotiates bills, prices, and contracts on your behalf. Just tell it what you want.',
  openGraph: {
    title: 'kiru - AI-powered negotiation',
    description: 'Your AI negotiates bills, prices, and contracts on your behalf. Just tell it what you want.',
    url: 'https://kiru.chat',
    siteName: 'kiru',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'kiru - AI-powered negotiation',
    description: 'Your AI negotiates bills, prices, and contracts on your behalf. Just tell it what you want.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-950 font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
