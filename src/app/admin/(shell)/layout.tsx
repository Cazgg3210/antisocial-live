import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminSession } from "@/lib/auth/admin-session";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getAdminSession();
  if (!s) redirect("/admin/login");
  const t = await getTranslations("admin");
  const nav = [
    ["/admin", t("dashboard")],
    ["/admin/events", t("events")],
    ["/admin/bands", t("bands")],
    ["/admin/people", t("people")],
    ["/admin/sponsors", t("sponsors")],
    ["/admin/applications", t("applications")],
    ["/admin/audience", t("audience")],
    ["/admin/analytics", t("analytics")],
    ["/admin/audit", t("audit")],
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-bg-elevated p-4 md:block">
        <p className="text-xs uppercase tracking-[0.3em] text-fg-subtle">Antisocial</p>
        <p className="text-gradient mb-6 text-xl font-black">Live</p>
        <nav className="space-y-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-bg-panel hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-border pt-4 text-xs text-fg-subtle">
          <p className="truncate">{s.name}</p>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex-1 p-4 md:p-8">
        <nav className="mb-4 flex flex-wrap gap-2 md:hidden">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted">{label}</Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
