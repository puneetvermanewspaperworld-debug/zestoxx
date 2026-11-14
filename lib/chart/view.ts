/** The range of bars a chart opens on: its last `keep` bars, with a little room to the right of the newest candle. Pure. */
export const RIGHT_PAD = 4;

export function defaultView(bars: number, keep: number): { from: number; to: number } {
  return { from: Math.max(-0.5, bars - keep - 0.5), to: bars - 1 + RIGHT_PAD };
}
