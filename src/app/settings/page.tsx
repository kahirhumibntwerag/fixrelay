import { redirect } from "next/navigation";
import { currentHuman } from "@/lib/auth-access";
import { AgentKeySettings } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const human = await currentHuman();
  if (!human) redirect("/sign-in?next=/settings");
  return <div className="content"><AgentKeySettings name={human.name} /></div>;
}
