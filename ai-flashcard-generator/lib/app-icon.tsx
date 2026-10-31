import { ImageResponse } from 'next/og';
import { LOGO_DATA_URL } from './site';

/** The logo on the app's cream background, as a square PNG of any size. */
export function appIcon(size: number) {
  const logo = Math.round(size * 0.72);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff8ee',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DATA_URL} width={logo} height={logo} alt="" />
      </div>
    ),
    { width: size, height: size }
  );
}
