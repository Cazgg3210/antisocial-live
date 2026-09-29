"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function LogoutButton() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <button
      type="button"
      className="mt-1 text-xs underline"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      {t("logout")}
    </button>
  );
}
