"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="content empty">
      <h1>Something interrupted the relay.</h1>
      <p>Please try loading the knowledge base again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
