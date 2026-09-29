import { expect, test } from "@playwright/test";
import { adminContext, controlAction, controlSnapshot, createFreshEvent, screenCode } from "./helpers";

test("public API rejects duplicate, out-of-range, closed and wrong-code votes; idempotent retries", async ({ browser, playwright }) => {
  const request = playwright.request;
  const admin = await adminContext(browser);
  const page = await admin.newPage();
  const ev = await createFreshEvent(page, `E2E Security ${Date.now()}`);
  await page.goto(`/admin/events/${ev.id}?tab=lineup`);
  await page.locator('select[name="bandId"]').first().selectOption({ label: "Marea Negra" });
  await page.getByRole("button", { name: "Agregar banda" }).first().click();
  await page.goto(`/admin/events/${ev.id}?tab=evaluators`);
  for (const [name, group] of [["Sec Judge", "JUDGE"], ["Sec Staff", "STAFF"]]) {
    await page.locator('input[name="newName"]').fill(name);
    await page.locator('select[name="group"]').selectOption(group);
    await page.getByRole("button", { name: "Asignar" }).click();
    await expect(page.getByRole("cell", { name }).first()).toBeVisible();
  }
  await page.close();

  const req = admin.request;
  await controlAction(req, ev.id, { action: "TAKE_CONTROL", force: true });
  await controlAction(req, ev.id, { action: "EVENT_GO_LIVE" });
  const perf = (await controlSnapshot(req, ev.id)).rounds[0].performances[0];
  await controlAction(req, ev.id, { action: "START_BAND", performanceId: perf.id });
  await controlAction(req, ev.id, { action: "OPEN_VOTING", performanceId: perf.id });
  const code = await screenCode(req, ev.slug);

  // Fresh anonymous voter session
  const voter = await request.newContext();
  const ctx = await (await voter.get(`/api/vote/${ev.slug}`)).json();
  const items = (v: number) => ctx.criteria.map((c: { id: string }) => ({ criterionId: c.id, value: v }));
  const key = crypto.randomUUID();

  const wrongCode = await voter.post(`/api/vote/${ev.slug}`, { data: { submissionKey: key, performanceId: perf.id, items: items(8), screenCode: "0000" } });
  expect(wrongCode.status()).toBe(400);
  const outOfRange = await voter.post(`/api/vote/${ev.slug}`, { data: { submissionKey: key, performanceId: perf.id, items: items(11), screenCode: code } });
  expect(outOfRange.status()).toBe(400);
  const ok = await voter.post(`/api/vote/${ev.slug}`, { data: { submissionKey: key, performanceId: perf.id, items: items(8), screenCode: code } });
  expect(ok.status()).toBe(201);
  const retry = await voter.post(`/api/vote/${ev.slug}`, { data: { submissionKey: key, performanceId: perf.id, items: items(8), screenCode: code } });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).duplicate).toBe(true);
  const second = await voter.post(`/api/vote/${ev.slug}`, { data: { submissionKey: crypto.randomUUID(), performanceId: perf.id, items: items(9), screenCode: code } });
  expect(second.status()).toBe(409);

  await controlAction(req, ev.id, { action: "CLOSE_VOTING", performanceId: perf.id });
  await expect.poll(async () => (await controlSnapshot(req, ev.id)).active.status, { timeout: 15_000 }).toBe("VOTING_CLOSED");
  const other = await request.newContext();
  await other.get(`/api/vote/${ev.slug}`);
  const late = await other.post(`/api/vote/${ev.slug}`, { data: { submissionKey: crypto.randomUUID(), performanceId: perf.id, items: items(8), screenCode: code } });
  expect(late.status()).toBe(409);

  // Configuration is frozen after voting opened.
  const p2 = await admin.newPage();
  await p2.goto(`/admin/events/${ev.id}?tab=policies`);
  await p2.getByRole("button", { name: "Guardar políticas" }).click();
  await expect(p2.getByText(/locked|bloqueada/i).first()).toBeVisible();
  await p2.close();

  // Control actions require the operator lock and the right role.
  const anon = await request.newContext();
  expect((await anon.post(`/api/control/${ev.id}/action`, { data: { action: "CALCULATE", performanceId: perf.id } })).status()).toBe(401);
  await admin.close();
});
