import { CampaignReader } from "@/components/campaign-reader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import { type CampaignViewData } from "@/components/campaign-view";
import { PublicResearchCharts } from "@/components/public-research-charts";
import { ComparisonTable, type ComparisonTableData } from "@/components/comparison-table";
import { listComparisonTables } from "@/lib/research-tables";
import { PublicSeriesChartsPanel } from "@/components/observatory/series-charts-panel";
export const dynamic = "force-dynamic";
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string; chart_offset?: string }>;
}) {
  const { id } = await params,
    p = await searchParams;
  const offset = Math.min(
      10000,
      Math.max(0, Math.floor(Number(p.offset) || 0)),
    ),
    data = await getCampaign(id, undefined, 10, offset);
  if (!data) notFound();
  const parsedChartOffset = Number(p.chart_offset || 0);
  const chartOffset = Number.isSafeInteger(parsedChartOffset) && parsedChartOffset >= 0 ? parsedChartOffset : 0;
  const { tables } = await listComparisonTables({ campaign_id: id, limit: 30 });
  return (
    <article className="content article">
      <Link className="text-link" href="/campaigns">
        ← All public campaigns
      </Link>
      <CampaignReader
        key={`${id}:${offset}`}
        initial={data as unknown as CampaignViewData}
      />
      <PublicResearchCharts campaignId={id} offset={chartOffset} experimentOffset={offset} />
      <PublicSeriesChartsPanel campaignId={id} />
      {tables.length > 0 && <section><h2>Comparison tables</h2>{tables.map((table: ComparisonTableData) => <ComparisonTable key={table.id} table={table} />)}</section>}
      {offset > 0 && (
        <Link
          className="text-link"
          href={`?offset=${Math.max(0, offset - 10)}&chart_offset=${chartOffset}`}
        >
          ← Previous experiments
        </Link>
      )}
    </article>
  );
}
