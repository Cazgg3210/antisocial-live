import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@antisocial.local", password: process.env.E2E_ADMIN_PASSWORD ?? "Antisocial!Demo2026" };

/** Logs in through the real login page and returns the context with the admin cookie. */
export async function adminContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 60_000 });
  await page.getByRole("textbox", { name: /correo|email/i }).fill(ADMIN.email);
  await page.getByRole("textbox", { name: /contraseña|password/i }).fill(ADMIN.password);
  await page.getByRole("button", { name: /iniciar sesión|sign in/i }).click();
  // /admin/login also starts with /admin: wait until we have left the login page.
  await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.startsWith("/admin/login"));
  await page.close();
  return ctx;
}

export async function controlAction(req: APIRequestContext, eventId: string, payload: Record<string, unknown>) {
  const res = await req.post(`/api/control/${eventId}/action`, { data: payload });
  const body = await res.json();
  expect(res.ok(), `${payload.action}: ${JSON.stringify(body)}`).toBeTruthy();
  return body;
}

export async function controlSnapshot(req: APIRequestContext, eventId: string) {
  const res = await req.get(`/api/control/${eventId}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/**
 * Creates a fresh REHEARSAL event through the admin UI so every run starts from a clean lineup
 * (bands, evaluators and the 40/20/40 demo config come from the seed defaults).
 */
export async function createFreshEvent(page: Page, name: string): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/events");
  await page.waitForLoadState("networkidle");
  await page.getByPlaceholder("Guerra de Bandas — Noche 5").fill(name);
  const dt = new Date(Date.now() + 3600_000);
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.locator('input[name="scheduledAt"]').fill(local);
  await page.getByRole("button", { name: "Crear" }).click();
  await page.waitForURL(/\/admin\/events\/[a-z0-9]+/);
  const id = page.url().split("/admin/events/")[1].split("?")[0];
  const slug = await page.locator("code").filter({ hasText: /^[a-z0-9-]+$/ }).first().innerText();
  return { id, slug };
}

export async function screenCode(req: APIRequestContext, slug: string): Promise<string | null> {
  const res = await req.get(`/api/stage/${slug}`);
  const body = await res.json();
  return body.screenCode?.code ?? null;
}

/** Casts a public vote from a brand-new anonymous browser context (a distinct phone). */
export async function castVote(browser: Browser, slug: string, values: number[], code: string | null): Promise<string> {
  const ctx = await browser.newContext({ ...(await import("@playwright/test")).devices["Pixel 7"] });
  const page = await ctx.newPage();
  await page.goto(`/vote/${slug}`);
  await page.getByRole("button", { name: /^(Evalúa a|Rate) / }).click();
  const groups = page.getByRole("radiogroup");
  const n = await groups.count();
  for (let i = 0; i < n; i++) await groups.nth(i).getByRole("radio", { name: new RegExp(`^${values[i % values.length]}(\\b|$)`) }).click();
  await page.getByRole("button", { name: /continuar|continue/i }).click();
  if (code) await page.locator('input[inputmode="numeric"]').fill(code);
  await page.getByRole("button", { name: /enviar mi voto|submit my vote/i }).click();
  await expect(page.getByText(/gracias por votar|thanks for voting/i)).toBeVisible();
  const confirmation = await page.locator("span.font-mono").first().innerText();
  await ctx.close();
  return confirmation;
}
