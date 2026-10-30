import { redirect } from "next/navigation";
import { currentHuman } from "@/lib/auth-access";
import { Observatory } from "@/components/observatory/dashboard";
import "@/components/observatory/observatory.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research Observatory · RogNet" };

export default async function ObservatoryPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const user = await currentHuman();
  if (!user) redirect("/sign-in?callbackURL=/observatory");
  const query = await searchParams;
  return <Observatory userName={user.name} initialCampaign={query.campaign} />;
}
