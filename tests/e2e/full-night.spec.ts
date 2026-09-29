import { expect, test, type BrowserContext } from "@playwright/test";
import { adminContext, castVote, controlAction, controlSnapshot, createFreshEvent, screenCode } from "./helpers";

/**
 * Full night: admin creates event → adds 3 bands → assigns evaluators → goes live → for each band:
 * start, open voting, N public voters + judges + staff, close, calculate, partial reveal → finalize
 * round → ranking, qualification, final reveal on Stage. Stage stays open the whole time and is
 * asserted at every step (Stage E2E requirement).
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let admin: BrowserContext;
let eventId: string;
let slug: string;
const BANDS = ["Belladona", "Zephyr", "Volt"];
const VOTERS = Number(process.env.E2E_VOTERS ?? 6);

test.beforeAll(async ({ browser }) => {
  admin = await adminContext(browser);
});
test.afterAll(async () => admin?.close());

test("admin creates event, lineup, evaluators", async () => {
  const page = await admin.newPage();
  const ev = await createFreshEvent(page, `E2E Night ${Date.now()}`);
  eventId = ev.id;
  slug = ev.slug;

  await page.goto(`/admin/events/${eventId}?tab=lineup`);
  for (const band of BANDS) {
    await page.locator('select[name="bandId"]').first().selectOption({ label: band });
    await page.getByRole("button", { name: "Agregar banda" }).first().click();
    await expect(page.locator("li", { hasText: band }).first()).toBeVisible();
  }
  await page.locator('input[name="qualifiersCount"]').first().fill("1");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Round saved")).toBeVisible();

  await page.goto(`/admin/events/${eventId}?tab=evaluators`);
  for (const [name, group] of [
    ["E2E Juez 1", "JUDGE"],
    ["E2E Juez 2", "JUDGE"],
    ["E2E Staff 1", "STAFF"],
  ]) {
    await page.locator('select[name="personId"]').selectOption("");
    await page.locator('input[name="newName"]').fill(name);
    await page.locator('select[name="group"]').selectOption(group);
    await page.getByRole("button", { name: "Asignar" }).click();
    await expect(page.getByRole("cell", { name }).first()).toBeVisible();
  }
  await page.goto(`/admin/events/${eventId}?tab=general`);
  await expect(page.getByText("CONFIGURING")).toBeVisible();
  await page.close();
});

test("event goes LIVE and Stage shows WELCOME", async ({ browser }) => {
  const req = admin.request;
  await controlAction(req, eventId, { action: "TAKE_CONTROL", force: true });
  await controlAction(req, eventId, { action: "EVENT_GO_LIVE" });
  const snap = await controlSnapshot(req, eventId);
  expect(snap.event.status).toBe("LIVE");

  const stage = await browser.newPage();
  await stage.goto(`/stage/${slug}`);
  await expect(stage.getByRole("heading", { name: /guerra de bandas|battle of the bands/i })).toBeVisible();
  for (const b of BANDS) await expect(stage.getByText(b)).toBeVisible();
  await stage.close();
});

for (const [i, band] of BANDS.entries()) {
  test(`band ${i + 1}: ${band} — start, vote, evaluate, close, calculate, reveal`, async ({ browser }) => {
    const req = admin.request;
    const stage = await browser.newPage();
    await stage.goto(`/stage/${slug}`);

    const snap = await controlSnapshot(req, eventId);
    const perf = snap.rounds[0].performances.find((p: { band: { name: string } }) => p.band.name === band);
    await controlAction(req, eventId, { action: "START_BAND", performanceId: perf.id });
    await expect(stage.getByText(band, { exact: true })).toBeVisible();
    await expect(stage.getByText(/en escenario|on stage/i)).toBeVisible();

    // Public page waits while band plays.
    const publicPage = await browser.newPage();
    await publicPage.goto(`/vote/${slug}`);
    await expect(publicPage.getByText(/aún no hay votación|voting hasn't opened/i)).toBeVisible();

    await controlAction(req, eventId, { action: "OPEN_VOTING", performanceId: perf.id });
    await expect(stage.getByText(/¡vota ahora!|vote now!/i)).toBeVisible();
    await expect(stage.locator('img[alt="QR"]')).toBeVisible();
    // Public page updates live via SSE without reload.
    await expect(publicPage.getByRole("button", { name: /^(Evalúa a|Rate) / })).toBeVisible({ timeout: 15_000 });
    await publicPage.close();

    const code = await screenCode(req, slug);
    expect(code).toMatch(/^\d{4}$/);
    const confirmations = await Promise.all(Array.from({ length: VOTERS }, (_, k) => castVote(browser, slug, [6 + ((k + i) % 4), 7, 8], code)));
    expect(new Set(confirmations).size).toBe(VOTERS);
    await expect(stage.getByText(new RegExp(`${VOTERS} votos recibidos|${VOTERS} votes received`))).toBeVisible({ timeout: 15_000 });

    // Evaluators through their personal one-time links.
    const s2 = await controlSnapshot(req, eventId);
    for (const [k, e] of s2.evaluators.entries()) {
      if (i === 0 && k === 1) continue; // judge 2 absent on band 1 → REDISTRIBUTE policy
      const issued = await controlAction(req, eventId, { action: "REISSUE_TOKEN", assignmentId: e.id });
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(new URL(issued.url).pathname);
      await expect(page.getByText(e.name)).toBeVisible();
      await page.getByRole("button", { name: /sí, soy yo|yes, it's me/i }).click();
      await page.waitForURL(/\/evaluate/);
      await expect(page.getByText(band, { exact: true })).toBeVisible();
      const groups = page.getByRole("radiogroup");
      const n = await groups.count();
      for (let g = 0; g < n; g++) await groups.nth(g).getByRole("radio", { name: /^8(\b|$)/ }).click();
      await page.getByRole("button", { name: /enviar evaluación final|submit final evaluation/i }).click();
      await expect(page.getByRole("alert").filter({ hasText: /enviada y bloqueada|submitted and locked/i })).toBeVisible();
      await ctx.close();
    }

    await controlAction(req, eventId, { action: "CLOSE_VOTING", performanceId: perf.id });
    await expect(stage.getByText(/votación cerrada|voting closed/i)).toBeVisible();
    // Grace period lets in-flight votes land; once VOTING_CLOSED, a vote must be rejected.
    await expect.poll(async () => (await controlSnapshot(req, eventId)).active.status, { timeout: 15_000 }).toBe("VOTING_CLOSED");
    const late = await castVote(browser, slug, [9], code).catch((e: Error) => e.message);
    expect(String(late)).not.toMatch(/^[A-Z0-9]{6}$/);
    const calc = await controlAction(req, eventId, { action: "CALCULATE", performanceId: perf.id });
    expect(calc.payload.acceptedVotes).toBeGreaterThanOrEqual(VOTERS);
    expect(calc.hash).toHaveLength(64);
    if (i === 0) expect(calc.payload.policiesApplied).toContain("MISSING_EVALUATOR(JUDGE:REDISTRIBUTE)");

    // Preview: result exists but Stage must not show it yet.
    await expect(stage.getByText(/calculando|calculating/i)).toBeVisible();
    await expect(stage.getByText(calc.finalScore)).toHaveCount(0);

    await controlAction(req, eventId, { action: "REVEAL_PARTIAL", performanceId: perf.id });
    await expect(stage.getByText(/avance|preview/i)).toBeVisible();
    await expect(stage.getByText("Jurado")).toBeVisible();
    // JUDGES_ONLY policy: the public score and final must not leak.
    await expect(stage.getByText("Público")).toHaveCount(0);
    await stage.close();
  });
}

test("final reveal: ranking ascending, qualifiers, winner, exports", async ({ browser }) => {
  const req = admin.request;
  const snap = await controlSnapshot(req, eventId);
  const roundId = snap.rounds[0].id;
  const fin = await controlAction(req, eventId, { action: "FINALIZE_ROUND", roundId });
  expect(fin.ranking).toHaveLength(BANDS.length);
  expect(fin.ranking.map((r: { position: number }) => r.position)).toEqual([1, 2, 3]);

  const stage = await browser.newPage();
  await stage.goto(`/stage/${slug}`);
  // One-by-one ascending reveal: last place first.
  const last = fin.ranking[fin.ranking.length - 1];
  await controlAction(req, eventId, { action: "REVEAL_NEXT", roundId });
  await expect(stage.getByText(last.bandName)).toBeVisible();
  await expect(stage.getByText(fin.ranking[0].bandName)).toHaveCount(0);
  for (let k = 1; k < fin.ranking.length; k++) await controlAction(req, eventId, { action: "REVEAL_NEXT", roundId });
  await expect(stage.getByText(fin.ranking[0].bandName)).toBeVisible();

  await controlAction(req, eventId, { action: "SCENE", scene: "WINNER", payload: { roundId } });
  await expect(stage.getByText(/ganador de la noche|winner of the night/i)).toBeVisible();
  await expect(stage.getByRole("heading", { name: fin.ranking[0].bandName })).toBeVisible();

  const final = await controlSnapshot(req, eventId);
  const q = final.rounds[0].performances.map((p: { qualification: { status: string } | null }) => p.qualification?.status);
  expect(q.filter((x: string) => x === "QUALIFIED")).toHaveLength(1);

  const csv = await req.get(`/api/export/${eventId}/results.csv`);
  expect(csv.ok()).toBeTruthy();
  expect(await csv.text()).toContain(fin.ranking[0].bandName);
  const pdf = await req.get(`/api/export/${eventId}/results.pdf`);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  await stage.close();
});

test("audit chain is intact and immutable", async () => {
  const page = await admin.newPage();
  await page.goto(`/admin/audit?event=${eventId}`);
  await expect(page.getByText(/cadena de hashes íntegra/i)).toBeVisible();
  await page.close();
});
