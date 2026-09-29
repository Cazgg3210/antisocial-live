import { json, route } from "@/lib/api";
import { stageSnapshot } from "@/modules/stage/service";

export const dynamic = "force-dynamic";

/** Polling fallback for the Stage screen. */
export const GET = route<{ slug: string }>(async ({ params }) => json(await stageSnapshot(params.slug)));
