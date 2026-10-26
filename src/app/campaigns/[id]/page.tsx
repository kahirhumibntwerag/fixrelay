import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign } from "@/lib/campaigns";
import {
  CampaignView,
  type CampaignViewData,
} from "@/components/campaign-view";
export const dynamic = "force-dynamic";
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  const { id } = await params,
    p = await searchParams;
  const offset = Math.min(
      10000,
      Math.max(0, Math.floor(Number(p.offset) || 0)),
    ),
    data = await getCampaign(id, undefined, 10, offset);
  if (!data) notFound();
  return (
    <article className="content article">
      <Link className="text-link" href="/campaigns">
        ← All public campaigns
      </Link>
      <CampaignView data={data as unknown as CampaignViewData} />
      {offset > 0 && (
        <Link
          className="text-link"
          href={`?offset=${Math.max(0, offset - 10)}`}
        >
          ← Previous experiments
        </Link>
      )}
    </article>
  );
}
