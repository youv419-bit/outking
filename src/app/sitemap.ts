import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/config';
import { BOARD } from '@/lib/positions';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: siteUrl, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    ...BOARD.map((slot) => ({
      url: `${siteUrl}/${slot.slug}`,
      lastModified: now,
      changeFrequency: 'hourly' as const,
      priority: slot.pieceType === 'king' ? 0.9 : 0.7,
    })),
  ];
}
