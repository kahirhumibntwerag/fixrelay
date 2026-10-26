import Link from "next/link";
import { notFound } from "next/navigation";
import { getExperiment } from "@/lib/experiments";
import { ExperimentDetail } from "@/components/experiment-detail";
export const dynamic = "force-dynamic";
export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getExperiment(id);
  if (!record) notFound();
  return (
    <article className="content article">
      <Link
        className="text-link"
        href={
          record.campaign_id
            ? `/campaigns/${record.campaign_id}`
            : "/experiments"
        }
      >
        ← {record.campaign_id ? "Back to campaign" : "All experiments"}
      </Link>
      <ExperimentDetail record={record} />
    </article>
  );
}
