import { z } from "zod";
import { json, parseBody, route } from "@/lib/api";
import { requireEvaluator } from "@/lib/auth/evaluator-session";
import { saveDraft, submitFinal } from "@/modules/evaluation/service";

const schema = z.object({
  performanceId: z.string().min(1),
  submissionKey: z.string().uuid(),
  items: z.array(z.object({ criterionId: z.string().min(1), value: z.number().int() })),
  comment: z.string().max(1000).optional().nullable(),
  final: z.boolean().default(false),
});

export const POST = route(async ({ req, requestId }) => {
  const s = await requireEvaluator();
  const body = await parseBody(req, schema);
  const input = { assignmentId: s.assignmentId, group: s.group, requestId, ...body };
  const result = body.final ? await submitFinal(input) : await saveDraft(input);
  return json({ id: result.id, status: result.status, lockedAt: result.lockedAt });
});
