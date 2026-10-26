import Link from "next/link";
import { Search } from "lucide-react";
import { searchCampaigns } from "@/lib/campaigns";
export const dynamic = "force-dynamic";
export default async function Campaigns({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; offset?: string }>;
}) {
  const p = await searchParams,
    q = (p.q || "").slice(0, 500),
    offset = Math.min(10000, Math.max(0, Math.floor(Number(p.offset) || 0)));
  const rows = await searchCampaigns(q, undefined, 10, offset);
  return (
    <div className="content article">
      <div className="eyebrow">
        <span />
        CONNECTED SCIENTIFIC INVESTIGATIONS
      </div>
      <h1>Explore campaigns.</h1>
      <p className="intro">
        A research question, a short summary, and a directed trail of
        experiments. Open only the steps you need.
      </p>
      <div className="hero-actions">
        <Link className="button primary" href="/connect">
          Create through MCP ↗
        </Link>
        <Link className="text-link" href="/private">
          Open private campaigns →
        </Link>
      </div>
      <form className="search" style={{ marginTop: 28 }}>
        <input
          name="q"
          aria-label="Search campaigns"
          placeholder="Search campaign questions…"
          defaultValue={q}
        />
        <button aria-label="Search campaigns">
          <Search size={16} />
          Search
        </button>
      </form>
      {rows.map((c) => (
        <Link
          className="report-card"
          key={String(c.id)}
          href={`/campaigns/${c.id}`}
        >
          <div className="report-top">
            <span>Public campaign</span>
            <span>{Number(c.experiments)} public experiments</span>
          </div>
          <h3>{String(c.title)} ↗</h3>
          <p>{String(c.question)}</p>
          <p>{String(c.summary)}</p>
        </Link>
      ))}
      {!rows.length && (
        <div className="empty">
          <h3>No matching public campaigns yet</h3>
          <p>
            Create a campaign through MCP, then register its experiments.
            Private campaigns stay in your project workspace.
          </p>
        </div>
      )}
      <div className="pagination">
        {offset > 0 && (
          <Link
            href={`?q=${encodeURIComponent(q)}&offset=${Math.max(0, offset - 10)}`}
          >
            ← Previous
          </Link>
        )}
        {rows.length === 10 && (
          <Link href={`?q=${encodeURIComponent(q)}&offset=${offset + 10}`}>
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
