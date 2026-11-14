import { notFound } from "next/navigation";
import FundCategoryView from "@/components/views/FundCategoryView";
import { isTileId } from "@/lib/mf/overview";
import { TILES } from "@/lib/mf/categories";

export function generateStaticParams() {
  return TILES.map((t) => ({ tile: t.id }));
}

export default async function FundCategoryPage({ params }: { params: Promise<{ tile: string }> }) {
  const { tile } = await params;
  if (!isTileId(tile)) notFound();
  return <FundCategoryView tile={tile} />;
}
