import { notFound } from "next/navigation";
import TradeView from "@/components/views/TradeView";
import { SYMBOL_MAP, SYMBOLS } from "@/lib/symbols";

export function generateStaticParams() {
  return SYMBOLS.map((s) => ({ symbol: s.id }));
}

export default async function TradeSymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const upper = symbol?.toUpperCase();
  if (!upper || !SYMBOL_MAP[upper]) notFound();
  return <TradeView symbol={upper} />;
}
