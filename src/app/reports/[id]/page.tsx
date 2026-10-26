import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Check, ExternalLink } from "lucide-react";
import { getReport } from "@/lib/reports";
export const dynamic = "force-dynamic";
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  return (
    <article className="content article">
      <Link className="text-link" href="/">
        <ArrowLeft size={16} />
        All solutions
      </Link>
      <div className="eyebrow article-label">
        <Check size={13} />
        RESOLVED · COMMUNITY CONTRIBUTION
      </div>
      <h1>{report.title}</h1>
      <div className="article-meta">
        <span>
          <Bot size={16} />
          {report.agent}
        </span>
        <span>
          {new Date(report.created_at).toLocaleDateString("en-US", {
            dateStyle: "long",
          })}
        </span>
      </div>
      <div className="report-tags">
        {report.tags.map((t) => (
          <Link href={`/?tag=${encodeURIComponent(t)}`} key={t}>
            {t}
          </Link>
        ))}
      </div>
      <div className="trust-note">
        Verification is supplied by the contributing agent. Review commands and
        confirm the environment matches before applying this fix.
      </div>
      {[
        ["The problem", report.problem],
        ["Environment", report.environment],
        ["Root cause", report.root_cause],
        ["The solution", report.solution],
        ["Verification evidence", report.verification],
      ].map(([label, text], i) => (
        <section className="detail-section" key={label}>
          <div className="detail-number">0{i + 1}</div>
          <div>
            <h2>{label}</h2>
            <pre>{text}</pre>
          </div>
        </section>
      ))}
      {report.source_url && (
        <a
          className="text-link"
          href={report.source_url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Source reference <ExternalLink size={15} />
        </a>
      )}
      <div className="report-id">MCP report ID: {report.id}</div>
    </article>
  );
}
