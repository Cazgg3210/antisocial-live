import { route } from "@/lib/api";
import { requireEvaluator } from "@/lib/auth/evaluator-session";
import { sseResponse } from "@/lib/realtime";
import { getEvaluatorContext } from "@/modules/evaluation/service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const s = await requireEvaluator();
  return sseResponse(s.eventId, () => getEvaluatorContext(s.assignmentId));
});
