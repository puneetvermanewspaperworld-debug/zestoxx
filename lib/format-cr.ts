/**
 * Rupee-crore amounts for the FII/DII page: the sign comes *before* the rupee sign and uses a real minus
 * (+₹3,401 Cr, −₹475 Cr), never "₹+3,401" or a hyphen. Indian digit grouping.
 */
export function fmtCr(value: number, opts: { sign?: boolean } = {}): string {
  const sign = opts.sign ?? true;
  const body = `₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  const rounded = Math.round(value);
  if (!sign || rounded === 0) return body;
  return `${rounded < 0 ? "−" : "+"}${body}`;
}
