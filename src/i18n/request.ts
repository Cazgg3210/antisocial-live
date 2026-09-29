import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

export const LOCALES = ["es-MX", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es-MX";
export const LOCALE_COOKIE = "al_locale";

export async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (fromCookie && (LOCALES as readonly string[]).includes(fromCookie)) return fromCookie as Locale;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^en\b/i.test(accept.split(",")[0] ?? "")) return "en";
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    timeZone: process.env.BUSINESS_TIMEZONE ?? "America/Mexico_City",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
