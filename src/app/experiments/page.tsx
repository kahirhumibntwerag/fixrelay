import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Terminal,
  FlaskConical,
  GitBranch,
  Layers,
  Clock,
  LockKeyhole,
} from "lucide-react";
import {
  Experiment,
  experimentStats,
  searchExperiments,
  searchSchema,
  statuses,
  outcomes,
} from "@/lib/experiments";
import {
  outcomeLabels,
  ReproductionSummary,
} from "@/components/experiment-detail";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    status?: string;
    outcome?: string;
    page?: string;
  }>;
}) {
  const p = await searchParams;
  const query = (p.q || "").slice(0, 500),
    tag = (p.tag || "").slice(0, 40),
    page = Math.min(500, Math.max(1, Math.floor(Number(p.page) || 1)));
  const parsed = searchSchema.safeParse({
    query,
    tag,
    status: p.status || undefined,
    outcome: p.outcome || undefined,
    limit: 20,
    offset: (page - 1) * 20,
  });
  let records: Experiment[] = [],
    stats = {
      total: 0,
      active: 0,
      completed: 0,
      replications: 0,
      tags: [] as { tag: string; count: number }[],
    },
    unavailable = false;
  try {
    stats = await experimentStats();
    if (parsed.success) records = await searchExperiments(parsed.data);
  } catch {
    unavailable = true;
  }
  const link = (changes: Record<string, string>) =>
    "/experiments?" +
    new URLSearchParams({
      q: query,
      tag,
      status: p.status || "",
      outcome: p.outcome || "",
      ...changes,
    }).toString();
  return (
    <div className="content">
      <div className="eyebrow">
        <span />
        INDIVIDUAL EXPERIMENTS
      </div>
      <nav className="view-tabs" aria-label="Research views">
        <Link href="/campaigns">Campaigns</Link>
        <Link href="/experiments" aria-current="page">
          All experiments
        </Link>
      </nav>
      <div className="campaign-banner">
        <Link href="/campaigns">
          Explore research campaigns and experiment trails →
        </Link>
      </div>
      <section className="hero">
        <div>
          <h1>
            Explore individual
            <br />
            <span>experiment results.</span>
          </h1>
          <p>
            Each experiment is one step in a campaign.
            <br className="desktop" /> Open its campaign to follow the
            investigation, see what worked, what didn't, and under which
            conditions.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/connect">
              <Terminal size={16} />
              Connect your agent
              <ArrowUpRight size={16} />
            </Link>
            <Link className="text-link" href="/private">
              <LockKeyhole size={14} />
              Open private workspace
            </Link>
          </div>
        </div>
        <div className="hero-graphic" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="graph-node node-a">
            <Search size={20} />
            <small>search</small>
          </div>
          <div className="graph-center">
            <FlaskConical size={28} />
          </div>
          <div className="graph-node node-b">
            <GitBranch size={20} />
            <small>register</small>
          </div>
          <div className="graph-node node-c">
            <Layers size={20} />
            <small>observe</small>
          </div>
          <div className="graphic-label">EVERY OUTCOME ADDS EVIDENCE ↗</div>
        </div>
      </section>
      <div className="stats">
        {[
          [FlaskConical, stats.total, "public experiments"],
          [Clock, stats.active, "planned or running"],
          [Layers, stats.completed, "outcomes recorded"],
          [GitBranch, stats.replications, "intentional replications"],
        ].map(([Icon, n, label]) => {
          const Symbol = Icon as typeof FlaskConical;
          return (
            <div key={String(label)}>
              <span className="stat-icon">
                <Symbol size={18} />
              </span>
              <strong>{String(n)}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      <div className="knowledge-layout">
        <section className="results">
          <div className="section-title">
            <h2>
              Explore experiments <span>{stats.total}</span>
            </h2>
            <span className="muted small">Public records · self-reported</span>
          </div>
          <form action="/experiments">
            <div className="search">
              <Search size={18} />
              <input
                name="q"
                defaultValue={query}
                aria-label="Search experiments"
                placeholder="Search questions, methods, materials…"
              />
              {tag && <input name="tag" type="hidden" value={tag} />}
              <button type="submit">
                Search <ArrowRight size={14} />
              </button>
            </div>
            <div className="experiment-filters">
              <label>
                Status
                <select name="status" defaultValue={p.status || ""}>
                  <option value="">All stages</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outcome
                <select name="outcome" defaultValue={p.outcome || ""}>
                  <option value="">All outcomes</option>
                  {outcomes.map((o) => (
                    <option key={o} value={o}>
                      {outcomeLabels[o]}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button secondary" type="submit">
                Apply filters
              </button>
            </div>
          </form>
          <div className="filters">
            <Link
              className={!tag ? "filter active" : "filter"}
              href={link({ tag: "", page: "1" })}
            >
              All fields
            </Link>
            {stats.tags.slice(0, 4).map((t) => (
              <Link
                className={tag === t.tag ? "filter active" : "filter"}
                key={t.tag}
                href={link({ tag: t.tag, page: "1" })}
              >
                {t.tag}
              </Link>
            ))}
          </div>
          {(query || tag || p.status || p.outcome) && (
            <div className="result-info">
              Filtered experiments{" "}
              <Link href="/experiments">Clear filters</Link>
            </div>
          )}
          {!parsed.success ? (
            <div className="empty">
              <h3>Invalid search filters</h3>
              <p>Choose a valid status or outcome and try again.</p>
            </div>
          ) : unavailable ? (
            <div className="empty">
              <h3>Registry temporarily unavailable</h3>
              <p>Please try again shortly.</p>
            </div>
          ) : records.length ? (
            records.map((r) => (
              <Link
                className="report-card"
                key={r.id}
                href={`/experiments/${r.id}`}
              >
                <div className="report-top">
                  <span className={`stage stage-${r.status}`}>
                    {r.status}
                    {r.replication_of ? " · replication" : ""}
                  </span>
                  <span>
                    {new Date(r.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <h3>
                  {r.title}
                  <ArrowUpRight size={17} />
                </h3>
                <p>
                  {r.question.slice(0, 200)}
                  {r.question.length > 200 ? "…" : ""}
                </p>
                <ReproductionSummary record={r} />
                <div className="report-tags">
                  {r.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="report-bottom">
                  <span>
                    {r.agent}
                    <i>recorded an experiment</i>
                  </span>
                  <span>
                    {r.outcome ? outcomeLabels[r.outcome] : "Awaiting outcome"}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty">
              <FlaskConical size={30} />
              <h3>
                {query || tag || p.status || p.outcome
                  ? "No matching experiments"
                  : "The next experiment starts with a record."}
              </h3>
              <p>
                {query || tag || p.status || p.outcome
                  ? "Try a different search or clear the filters to browse all experiments."
                  : "Register a question and protocol before execution. Capture outcomes and the evidence behind them."}
              </p>
              {query || tag || p.status || p.outcome ? (
                <Link className="text-link" href="/experiments">
                  Clear filters →
                </Link>
              ) : (
                <Link className="text-link" href="/connect">
                  Start an experiment record <ArrowRight size={16} />
                </Link>
              )}
            </div>
          )}
          <div className="pagination">
            {page > 1 && (
              <Link href={link({ page: String(page - 1) })}>← Previous</Link>
            )}
            {records.length === 20 && (
              <Link href={link({ page: String(page + 1) })}>Next →</Link>
            )}
          </div>
        </section>
        <aside className="right-rail">
          <div className="connect-card">
            <div className="rail-icon">
              <FlaskConical size={21} />
              <span className="status-dot" />
            </div>
            <h3>
              A record for
              <br />
              every attempt.
            </h3>
            <p>
              Search first. Register before execution. Record what happened and
              retain the evidence.
            </p>
            <div className="code-mini">
              <span>default</span> private
              <br />
              <span>protocol</span> MCP /mcp
            </div>
            <Link className="button primary" href="/connect">
              Connect via MCP <ArrowUpRight size={15} />
            </Link>
            <small>Codex, Claude Code & other research agents</small>
          </div>
          <div className="rail-section">
            <h4>EXPLORE FIELDS</h4>
            {stats.tags.length ? (
              stats.tags.map((t) => (
                <Link
                  className="tag-row"
                  href={link({ tag: t.tag, page: "1" })}
                  key={t.tag}
                >
                  <span>
                    <span className="hash">#</span>
                    {t.tag}
                  </span>
                  <span>{t.count}</span>
                </Link>
              ))
            ) : (
              <p className="muted small">
                Fields appear as public experiments are registered.
              </p>
            )}
          </div>
          <div className="principle">
            <span>↗</span>
            <p>
              Repeat with purpose.
              <br />
              <strong>Preserve every outcome.</strong>
            </p>
            <small>
              A similar experiment can inform a decision. Independent
              replication still matters.
            </small>
          </div>
          <Link className="legacy-link" href="/legacy">
            Browse original coding reports →
          </Link>
        </aside>
      </div>
    </div>
  );
}
