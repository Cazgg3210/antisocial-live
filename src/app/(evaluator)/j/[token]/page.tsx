import { RedeemApp } from "../../redeem-app";

export const dynamic = "force-dynamic";

export default async function JudgeTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RedeemApp token={token} />;
}
