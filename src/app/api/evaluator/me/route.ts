import { json, route } from "@/lib/api";
import { requireEvaluator } from "@/lib/auth/evaluator-session";
import { getEvaluatorContext } from "@/modules/evaluation/service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const s = await requireEvaluator();
  return json(await getEvaluatorContext(s.assignmentId));
});
