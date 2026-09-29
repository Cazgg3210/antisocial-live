import type { Metadata } from "next";
import { VoteApp } from "./vote-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vota" };

export default async function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <VoteApp slug={slug} />;
}
