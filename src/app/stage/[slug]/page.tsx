import type { Metadata } from "next";
import { StageApp } from "./stage-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stage" };

export default async function StagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StageApp slug={slug} />;
}
