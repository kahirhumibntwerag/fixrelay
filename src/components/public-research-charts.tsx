import { listPublicResearchCharts } from "@/lib/research-charts";
import { formatResearchText } from "@/lib/research-text";
import "./public-research-charts.css";

export async function PublicResearchCharts({
  campaignId,
}: {
  campaignId: string;
}) {
  const { charts } = await listPublicResearchCharts(campaignId);
  if (!charts.length) return null;
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
    </section>
  );
}
