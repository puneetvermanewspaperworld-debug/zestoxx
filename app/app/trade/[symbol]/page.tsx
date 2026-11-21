import { notFound } from "next/navigation";
import TradeView from "@/components/views/TradeView";
import { SYMBOLS } from "@/lib/symbols";
import { isTradableId } from "@/lib/dynamic-symbols";

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
  // the twelve built-in symbols are built ahead; any other NSE equity or ETF is rendered on demand, its quote and candles fetched by the page
  if (!upper || !isTradableId(upper)) notFound();
  return <TradeView symbol={upper} />;
}
