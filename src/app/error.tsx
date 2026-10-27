"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="content empty">
      <h1>We couldn’t load this page.</h1>
      <p>
        Check your connection, then try again. If the problem continues, return
        to the campaign list.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <p>
        <a className="text-link" href="/">
          Back to campaigns →
        </a>
      </p>
    </div>
  );
}
