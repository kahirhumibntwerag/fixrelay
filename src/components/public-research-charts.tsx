import { listPublicResearchCharts } from "@/lib/research-charts";
import { formatResearchText } from "@/lib/research-text";
import Link from "next/link";
import "./public-research-charts.css";

export async function PublicResearchCharts({
  campaignId,
  offset = 0,
  experimentOffset = 0,
}: {
  campaignId: string;
  offset?: number;
  experimentOffset?: number;
}) {
  const { charts, next_offset } = await listPublicResearchCharts(campaignId, offset);
  if (!charts.length && offset === 0) return null;
  return (
    <section className="public-research-charts">
      <h2>Charts and graphs</h2>
      <div className="public-research-chart-grid">
        {charts.map((chart) => (
          <figure key={chart.id}>
            <a
              href={chart.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open chart: ${chart.title}`}
            >
              {/* Native images use the access-controlled, same-origin chart route. */}
              <img src={chart.url} alt={chart.title} loading="lazy" />
            </a>
            <figcaption>
              <strong>{formatResearchText(chart.title)}</strong>
              {chart.caption && <p>{formatResearchText(chart.caption)}</p>}
            </figcaption>
          </figure>
        ))}
      </div>
      <nav aria-label="Chart pages">
        {offset > 0 && <Link className="text-link" href={`?offset=${experimentOffset}&chart_offset=${Math.max(0, offset - 30)}`}>← Previous charts</Link>}
        {next_offset !== null && <Link className="text-link" href={`?offset=${experimentOffset}&chart_offset=${next_offset}`}>Next charts →</Link>}
      </nav>
    </section>
  );
}
