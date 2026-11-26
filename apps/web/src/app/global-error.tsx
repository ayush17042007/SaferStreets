"use client";

import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Uses only plain markup and tokens via CSS classes. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body className="bg-cream text-ink">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-[12px] leading-4 text-text-secondary">Error 500</p>
          <h1 className="type-h1">Something went wrong on our side</h1>
          <p className="text-[16px] leading-6 text-text-secondary">Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-control border border-ink bg-ink px-4 text-[14px] leading-5 font-medium text-white"
          >
            Try again
          </button>
          <p className="text-[14px] leading-5 text-text-secondary">
            In danger? Call{" "}
            <a href="tel:112" className="font-semibold text-ink underline">
              112
            </a>{" "}
            first.
          </p>
        </main>
      </body>
    </html>
  );
}
