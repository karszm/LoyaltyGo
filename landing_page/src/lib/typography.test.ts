// Run: node --experimental-strip-types --test landing_page/src/lib/typography.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bindOrphans } from "./typography.ts";

const NB = " ";

test("binds single-letter words to the next word in text only", () => {
  assert.equal(bindOrphans("<h3>Twoja karta w panelu</h3>"), `<h3>Twoja karta w${NB}panelu</h3>`);
  assert.equal(bindOrphans("<p>i w domu, a Z tobą</p>"), `<p>i${NB}w${NB}domu, a${NB}Z${NB}tobą</p>`);
  assert.equal(bindOrphans("<p>(w panelu) „i dalej”</p>"), `<p>(w${NB}panelu) „i${NB}dalej”</p>`);
  assert.equal(bindOrphans("<p>kawa w</p>"), "<p>kawa w</p>");
  assert.equal(bindOrphans("<p>Twoja i Moja</p>"), `<p>Twoja i${NB}Moja</p>`);
});

test("leaves tags, attributes, scripts and styles untouched", () => {
  const html = `<img alt="karta w telefonie" /><script>const a = 1; if (x) a = 2;</script><style>a b { color: red }</style>`;
  assert.equal(bindOrphans(html), html);
});
