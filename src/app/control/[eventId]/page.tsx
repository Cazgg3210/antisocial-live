import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession, hasRole } from "@/lib/auth/admin-session";
import { ControlApp } from "./control-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Control Room" };

export default async function ControlPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const s = await getAdminSession();
  if (!s) redirect(`/admin/login?next=/control/${eventId}`);
  if (!hasRole(s, "STAFF_COORDINATOR", eventId)) redirect("/admin");
  return <ControlApp eventId={eventId} me={{ userId: s.userId, name: s.name, canManage: hasRole(s, "EVENT_MANAGER", eventId), canOperate: hasRole(s, "STAGE_OPERATOR", eventId) }} />;
}
