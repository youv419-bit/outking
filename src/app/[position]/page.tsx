import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Site from '@/components/Site';
import { brand, currency, siteUrl } from '@/lib/config';
import { formatCents } from '@/lib/money';
import { getBoardState, getPosition } from '@/lib/positions';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ position: string }>;
}): Promise<Metadata> {
  const { position: slug } = await params;
  const position = await getPosition(slug);
  if (!position) {
    return { title: 'Position not found' };
  }

  const owned = position.isOwned && position.company;
  const title = owned
    ? `${position.label} owned by ${position.company?.name}`
    : `${position.label} is available`;
  const description = owned
    ? `Someone owns the ${position.label} on ChessBid at ${formatCents(
        position.currentBidCents ?? 0,
        currency,
      )}. Want it? Steal it for ${formatCents(position.nextBidCents, currency)}.`
    : `The ${position.label} is unclaimed on ChessBid. Claim it for ${formatCents(
        position.nextBidCents,
        currency,
      )} and put your brand on the board.`;

  const url = `${siteUrl}/${position.slug}`;

  return {
    title,
    description,
    alternates: { canonical: `/${position.slug}` },
    openGraph: {
      type: 'website',
      url,
      siteName: brand.name,
      title: `ChessBid - ${title}`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `ChessBid - ${title}`,
      description,
      creator: brand.twitter,
    },
  };
}

export default async function PositionPage({
  params,
}: {
  params: Promise<{ position: string }>;
}) {
  const { position: slug } = await params;
  const position = await getPosition(slug);
  if (!position) notFound();

  const user = await currentUser();
  const state = await getBoardState(user?.id ?? null);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `ChessBid ${position.label}`,
    description: position.company
      ? `${position.label} on ChessBid, currently held by ${position.company.name}.`
      : `${position.label} on ChessBid - unclaimed.`,
    url: `${siteUrl}/${position.slug}`,
    brand: { '@type': 'Brand', name: brand.name },
    offers: {
      '@type': 'Offer',
      price: (position.nextBidCents / 100).toFixed(2),
      priceCurrency: currency,
      availability: 'https://schema.org/InStock',
      url: `${siteUrl}/${position.slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Site state={state} initialSlug={position.slug} />
    </>
  );
}
