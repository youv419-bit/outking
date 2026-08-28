import { ImageResponse } from 'next/og';
import { currency } from '@/lib/config';
import { formatCents } from '@/lib/money';
import { getPosition } from '@/lib/positions';

export const runtime = 'nodejs';
export const alt = 'ChessBid position';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The mark is drawn as a path, not as the Unicode chess character.
 *
 * Satori (which renders these cards) ships one Latin font. Given a glyph it
 * cannot draw it goes looking for a font online, and on a piece like the black
 * king that request 400s - filling the deploy logs with "Failed to load
 * dynamic font" on every crawler hit. A path has no font to miss.
 */
function KingMark() {
  return (
    <svg width="52" height="52" viewBox="0 0 512 512" fill="#d4ac5c">
      <path d="M236 40h40v34h34v40h-34v46c34 12 58 34 66 62l24 84c4 14-6 28-21 28H167c-15 0-25-14-21-28l24-84c8-28 32-50 66-62V114h-34V74h34V40z" />
      <rect x="140" y="352" width="232" height="42" rx="14" />
      <rect x="116" y="410" width="280" height="52" rx="18" />
    </svg>
  );
}

type ImageParams = { position: string };

export default async function Image({
  params,
}: {
  params: ImageParams | Promise<ImageParams>;
}) {
  // Next 15 hands metadata routes their params asynchronously; awaiting a
  // plain object is harmless, so this works on either shape.
  const { position: slug } = await Promise.resolve(params);
  const position = await getPosition(slug).catch(() => null);

  const title = position
    ? position.isOwned && position.company
      ? `${position.label.toUpperCase()} OWNED BY ${position.company.name.toUpperCase()}`
      : `${position.label.toUpperCase()} IS AVAILABLE`
    : 'BECOME THE KING';

  const currentLabel = position?.isOwned ? 'Current bid' : 'Starting bid';
  const currentValue = position
    ? formatCents(position.currentBidCents ?? position.startingBidCents, currency)
    : '';
  const stealValue = position ? formatCents(position.nextBidCents, currency) : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #08080a 0%, #14100a 55%, #050506 100%)',
          padding: '64px 72px',
          color: '#ece9e3',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <KingMark />
          <div
            style={{
              fontSize: 24,
              letterSpacing: 10,
              color: 'rgba(236,233,227,0.55)',
            }}
          >
            CHESSBID
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: title.length > 34 ? 62 : 78,
              lineHeight: 1.05,
              fontWeight: 700,
              color: '#f0d79c',
              display: 'flex',
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 30,
              color: 'rgba(236,233,227,0.6)',
              display: 'flex',
            }}
          >
            Own it. Defend it. Outbid anyone.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 56, alignItems: 'flex-end' }}>
          {position && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 20, letterSpacing: 4, color: 'rgba(236,233,227,0.4)' }}>
                  {currentLabel.toUpperCase()}
                </div>
                <div style={{ fontSize: 54, color: '#ece9e3' }}>{currentValue}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 20, letterSpacing: 4, color: 'rgba(236,233,227,0.4)' }}>
                  {position.isOwned ? 'STEAL FOR' : 'CLAIM FOR'}
                </div>
                <div style={{ fontSize: 54, color: '#d4ac5c' }}>{stealValue}</div>
              </div>
            </>
          )}
        </div>
      </div>
    ),
    size,
  );
}
