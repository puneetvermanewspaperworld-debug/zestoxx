/**
 * Starred items. A starred drawing tool or study is pinned to the top of its menu, in the order it was starred; everything else keeps
 * its place below. Pure.
 */
export function toggleFavourite(favs: readonly string[], id: string): string[] {
  return favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
}

/** The items with the starred ones first (in starring order), then the rest in their own order. Items not in `items` are ignored; nothing is lost or repeated. */
export function pinFirst<T>(items: readonly T[], favs: readonly string[], idOf: (item: T) => string): T[] {
  const byId = new Map(items.map((i) => [idOf(i), i]));
  const starred = favs.filter((f, k) => byId.has(f) && favs.indexOf(f) === k).map((f) => byId.get(f) as T);
  const rest = items.filter((i) => !favs.includes(idOf(i)));
  return [...starred, ...rest];
}
