import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://kiru.chat'),
  title: 'kiru — Never sit on hold again',
  description: 'Tell kiru what you want. It calls the company, negotiates your bill or price, and gets you a better deal. You save money; you skip the hold music.',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
  },
  openGraph: {
    title: 'kiru — Never sit on hold again',
    description: 'Tell kiru what you want. It calls the company, negotiates your bill or price, and gets you a better deal. You save money; you skip the hold music.',
    url: 'https://kiru.chat',
    siteName: 'kiru',
    type: 'website',
    images: [{ url: '/og-preview.jpg', width: 1200, height: 630, alt: 'kiru — Never sit on hold again' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'kiru — Never sit on hold again',
    description: 'Tell kiru what you want. It calls the company, negotiates your bill or price, and gets you a better deal. You save money; you skip the hold music.',
    images: ['/og-preview.jpg'],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] bg-white text-gray-950 font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
