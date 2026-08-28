import type { MetadataRoute } from 'next';
import { brand } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChessBid - Become the King',
    short_name: 'ChessBid',
    description: brand.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#050506',
    theme_color: '#050506',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
