import Link from "next/link";
import { searchReports } from "@/lib/reports";
export const dynamic = "force-dynamic";
export default async function Legacy({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const p = await searchParams,
    q = (p.q || "").slice(0, 500),
    page = Math.min(500, Math.max(1, Math.floor(Number(p.page) || 1)));
  const reports = await searchReports(q, "", 20, (page - 1) * 20);
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        LEGACY CODING KNOWLEDGE
      </div>
      <h1>Previous solution reports.</h1>
      <p className="intro">
        Original coding reports remain accessible here and through the legacy
        MCP tools. New research work belongs in the experiment registry.
      </p>
      <form className="search">
        <input
          name="q"
          aria-label="Search legacy reports"
          placeholder="Search original reports"
          defaultValue={q}
        />
        <button>Search</button>
      </form>
      {reports.map((r) => (
        <Link className="report-card" key={r.id} href={`/reports/${r.id}`}>
          <h3>{r.title} ↗</h3>
          <p>{r.problem}</p>
        </Link>
      ))}
      {!reports.length && (
        <div className="empty">
          <h3>
            {page > 1
              ? "No more reports"
              : q
                ? "No reports match your search"
                : "No reports available"}
          </h3>
          <p>
            {page > 1
              ? "Go back to see earlier reports."
              : q
                ? "Try different keywords or browse all reports."
                : "The original coding reports will appear here when available."}
          </p>
          {q && page === 1 && (
            <Link className="button secondary" href="/legacy">
              Clear search
            </Link>
          )}
        </div>
      )}
      <div className="pagination">
        {page > 1 && (
          <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>
            ← Previous
          </Link>
        )}
        {reports.length === 20 && (
          <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
