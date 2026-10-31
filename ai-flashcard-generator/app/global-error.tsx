'use client'; // Error boundaries must be Client Components

/**
 * Last-resort error page, used if the root layout itself fails. It replaces
 * the whole document, so it can't rely on the app's stylesheet or fonts.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: 'Canvas',
          color: 'CanvasText',
          colorScheme: 'light dark',
          padding: 16,
        }}
      >
        <title>Something went wrong · Flashly</title>
        <main style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 24px', opacity: 0.8, lineHeight: 1.5 }}>
            Flashly couldn’t load. Your sets are saved in this browser, so
            nothing is lost. Please try again.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              font: 'inherit',
              fontWeight: 700,
              padding: '12px 22px',
              borderRadius: 12,
              border: '2px solid #1b1033',
              background: '#6c47ff',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
