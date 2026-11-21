import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * The phone type scale lives in one place, app/globals.css: theme tokens (--text-*) and the rules that map every pixel size a component uses
 * onto them. These tests keep it that way: the tokens hold the agreed values, the phone rules refer to tokens and never to a number, and a
 * component that starts using a size the scale does not know about fails here instead of quietly looking different on a phone.
 */
const css = fs.readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");

const theme = css.slice(css.indexOf("@theme static {"), css.indexOf("}", css.indexOf("@theme static {")));
const token = (name: string): string | null => theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? null;

const phone = css.slice(css.indexOf("@media (max-width: 767px) {"), css.indexOf(".zx-dark {"));

describe("the tokens", () => {
  it("hold the agreed sizes", () => {
    assert.equal(token("text-caption"), "11px");
    assert.equal(token("text-secondary"), "12px");
    assert.equal(token("text-body"), "13px");
    assert.equal(token("text-row"), "14px");
    assert.equal(token("text-price"), "15px");
    assert.equal(token("text-title"), "18px");
    assert.equal(token("text-display"), "20px");
    assert.equal(token("text-input"), "16px");
    assert.equal(token("row-pad-y"), "9px");
  });
  it("are inside the ranges asked for", () => {
    const px = (n: string) => parseFloat(token(n) ?? "NaN");
    assert.ok(px("text-caption") >= 11, "nothing below 11px");
    assert.ok(px("text-secondary") >= 11 && px("text-secondary") <= 12);
    assert.equal(px("text-body"), 13);
    assert.equal(px("text-row"), 14);
    assert.ok(px("text-price") >= 14 && px("text-price") <= 15);
    assert.ok(px("text-title") >= 18 && px("text-title") <= 20);
    assert.ok(px("row-pad-y") >= 8 && px("row-pad-y") <= 10);
    assert.ok(px("text-input") >= 16, "an input under 16px makes a phone zoom the page");
  });
});

describe("the phone rules", () => {
  it("set a font size only through a token", () => {
    const sizes = [...phone.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.ok(sizes.length >= 8);
    for (const s of sizes) assert.match(s, /^var\(--text-[a-z]+\)( !important)?$/, `font-size: ${s}`);
  });
  it("are all inside the media query for a phone, so a wide screen is not touched", () => {
    assert.ok(css.indexOf("@media (max-width: 767px) {") < css.indexOf(".text-\\[8\\.5px\\]"));
    // no font-size rule for these classes outside it
    const before = css.slice(0, css.indexOf("@media (max-width: 767px) {"));
    assert.ok(!/\.text-\\\[\d/.test(before));
  });
});

describe("every size a component uses is on the scale", () => {
  const mapped = new Set<string>();
  for (const m of phone.matchAll(/\.text-\\\[([\d\\.]+)px\\\]/g)) mapped.add(m[1].replace(/\\/g, ""));

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  };
  walk("components");
  walk("app");

  it("a text-[Npx] class (the phone's, with no breakpoint prefix) names a size the scale maps", () => {
    const unmapped: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/(^|[\s"'`{])text-\[([\d.]+)px\]/g)) if (!mapped.has(m[2])) unmapped.push(`${f}: text-[${m[2]}px]`);
    }
    assert.deepEqual([...new Set(unmapped)], []);
  });
  it("and the mapped sizes are the ones in use (none of the rules is dead weight)", () => {
    const used = new Set<string>();
    for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/(^|[\s"'`{])text-\[([\d.]+)px\]/g)) used.add(m[2]);
    const dead = [...mapped].filter((s) => !used.has(s));
    assert.ok(dead.length <= 3, `rules for sizes nothing uses: ${dead.join(", ")}`);
  });
});
