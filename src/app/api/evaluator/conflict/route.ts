import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireEvaluator } from "@/lib/auth/evaluator-session";
import { declareConflict } from "@/modules/evaluation/service";

export const POST = route(async ({ req }) => {
  const s = await requireEvaluator();
  const body = await parseBody(req, z.object({ bandId: z.string().min(1), reason: z.string().max(300).optional() }));
  await declareConflict(s.assignmentId, body.bandId, body.reason);
  return json({ ok: true });
});
