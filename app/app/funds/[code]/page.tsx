import { notFound } from "next/navigation";
import FundSchemeView from "@/components/views/FundSchemeView";

export default async function FundSchemePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{1,9}$/.test(code)) notFound();
  return <FundSchemeView code={code} />;
}
