import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * A hard-coded "+" in front of a computed number prints "+-0.09" whenever the number is negative. Signs come from
 * fmtSigned (or a sign chosen from the value); a literal "+" straight before a `{...}` expression is never allowed.
 */
function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) ? [p] : [];
  });
}

const JSX_PLUS_EXPR = /(^|[>\s])\+\{[^}]*\}/;
const TEMPLATE_PLUS_EXPR = /\+\$\{[^}]*(toFixed|chg|change)/;

describe("no hard-coded plus sign before a computed number", () => {
  it("the check itself catches the old bug", () => {
    assert.ok(JSX_PLUS_EXPR.test('<span>+{g.chg.toFixed(2)}%</span>'));
    assert.ok(TEMPLATE_PLUS_EXPR.test("`+${chg.toFixed(2)}`"));
    assert.ok(!JSX_PLUS_EXPR.test('<span>{fmtSigned(g.chg, 2, "%")}</span>'));
  });
  for (const f of [...files("components"), ...files("app")]) {
    it(f.replace(/\\/g, "/"), () => {
      const bad = fs
        .readFileSync(f, "utf8")
        .split(/\r?\n/)
        .filter((l) => JSX_PLUS_EXPR.test(l) || TEMPLATE_PLUS_EXPR.test(l));
      assert.deepEqual(bad, []);
    });
  }
});
