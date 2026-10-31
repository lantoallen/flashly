import { ImageResponse } from 'next/og';
import { LOGO_DATA_URL } from '@/lib/site';

export const alt = 'Flashly: turn notes into flashcards that actually stick';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The preview card shown when a Flashly link is shared in chats and social apps. */
export default function OpengraphImage() {
  const chips = ['Flashcards', 'Spaced review', 'Quiz', 'Test', 'Match'];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '72px 80px',
          background: '#fff8ee',
          color: '#1b1033',
          borderBottom: '24px solid #6c47ff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          { }
          <img src={LOGO_DATA_URL} width={112} height={112} alt="" />
          <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>Flashly</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 64, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 980 }}>
          Turn notes into flashcards that actually stick.
        </div>
        <div style={{ marginTop: 36, display: 'flex', gap: 14 }}>
          {chips.map((c) => (
            <div
              key={c}
              style={{
                display: 'flex',
                fontSize: 28,
                fontWeight: 700,
                padding: '10px 22px',
                borderRadius: 999,
                border: '3px solid #1b1033',
                background: '#ffffff',
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 32, fontSize: 28, color: '#5d5676' }}>
          Free · No sign-up needed · AI-powered
        </div>
      </div>
    ),
    size
  );
}
