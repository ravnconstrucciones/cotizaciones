"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body>
        <button onClick={reset}>Reintentar</button>
      </body>
    </html>
  );
}
