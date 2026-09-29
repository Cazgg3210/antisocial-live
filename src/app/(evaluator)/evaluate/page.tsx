import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getEvaluatorSession } from "@/lib/auth/evaluator-session";
import { EvaluateApp } from "./evaluate-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evaluación" };

export default async function EvaluatePage() {
  const s = await getEvaluatorSession();
  if (!s) redirect("/");
  return <EvaluateApp />;
}
