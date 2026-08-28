import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { brand, siteUrl } from '@/lib/config';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ChessBid - Become the King',
    template: '%s | ChessBid',
  },
  description: brand.description,
  keywords: [
    'chessbid',
    'own the king',
    'chess ownership',
    'bid and outbid',
    'brand auction',
    '3d chessboard',
    'outbid game',
    'buy a chess position',
  ],
  applicationName: brand.name,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: brand.name,
    title: 'ChessBid - Become the King',
    description: brand.tagline,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ChessBid - Become the King' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ChessBid - Become the King',
    description: brand.tagline,
    images: ['/og.png'],
    creator: brand.twitter,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#050506',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const organisationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: brand.name,
  url: siteUrl,
  description: brand.description,
  potentialAction: {
    '@type': 'ViewAction',
    target: `${siteUrl}/king`,
    name: 'Own the King',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organisationJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
