// validate.test.ts — table of the cases that matter: the mirror must accept everything the
// server (public-api/index.ts EMAIL_RE) accepts, and reject everything it rejects, with zero
// daylight between them (task-8-brief.md's "never stricter than the server" rule).
//
// Two things this file pins down that a self-referential test can't catch (task-8 review):
// 1. EMAIL_MAX_LENGTH/NAME_MAX_LENGTH are asserted against their LITERAL server values, not
//    just "whatever the constant currently says" — a boundary test that only measures relative
//    to the imported constant stays green even if the constant itself drifts from the server.
// 2. EMAIL_PATTERN (the string fed to the native <input pattern>, the ONLY validation a
//    customer with JS disabled gets) has its own tests — a mutation that only changes
//    EMAIL_PATTERN (e.g. leaving its anchors in) has zero effect on isValidEmail and would
//    otherwise sail through untested.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_MAX_LENGTH, EMAIL_PATTERN, EMAIL_RE, NAME_MAX_LENGTH, isValidEmail, isValidName } from "./validate.ts";

// Literal, not relative to the imported constants — backend/supabase/functions/public-api/
// index.ts:24 and :23. If either mirror drifts from these numbers, this must fail here, not at
// a till.
test("EMAIL_MAX_LENGTH mirrors public-api/index.ts:24's literal value (254)", () => {
  assert.equal(EMAIL_MAX_LENGTH, 254);
});

test("NAME_MAX_LENGTH mirrors public-api/index.ts:23's literal value (80)", () => {
  assert.equal(NAME_MAX_LENGTH, 80);
});

test("isValidEmail: accepts an ordinary address", () => {
  assert.equal(isValidEmail("ala@test.pl"), true);
});

test("isValidEmail: accepts a plus-tagged address (server regex has no such restriction)", () => {
  assert.equal(isValidEmail("ala+loyalty@test.pl"), true);
});

// Pins the mirror to the SERVER's rule, not to itself: every other email fixture in this file
// happens to use a two-or-more-character TLD, so a client made stricter (e.g. requiring TLD
// length >= 2) would reject this address the server accepts, at the till, with no recourse —
// and the suite would otherwise never notice (task-8 review).
test("isValidEmail: accepts a one-character TLD (server's EMAIL_RE has no minimum TLD length)", () => {
  assert.equal(isValidEmail("a@b.c"), true);
});

test("isValidEmail: trims surrounding whitespace before checking, same as the server's .trim()", () => {
  assert.equal(isValidEmail("  ala@test.pl  "), true);
});

test("isValidEmail: rejects missing @", () => {
  assert.equal(isValidEmail("ala.test.pl"), false);
});

test("isValidEmail: rejects missing dot in the domain", () => {
  assert.equal(isValidEmail("ala@testpl"), false);
});

test("isValidEmail: rejects a space inside the address", () => {
  assert.equal(isValidEmail("ala test@test.pl"), false);
});

test("isValidEmail: rejects empty string", () => {
  assert.equal(isValidEmail(""), false);
});

test(`isValidEmail: accepts exactly ${EMAIL_MAX_LENGTH} characters`, () => {
  const local = "a".repeat(EMAIL_MAX_LENGTH - "@test.pl".length);
  const email = `${local}@test.pl`;
  assert.equal(email.length, EMAIL_MAX_LENGTH);
  assert.equal(isValidEmail(email), true);
});

test(`isValidEmail: rejects ${EMAIL_MAX_LENGTH + 1} characters`, () => {
  const local = "a".repeat(EMAIL_MAX_LENGTH + 1 - "@test.pl".length);
  const email = `${local}@test.pl`;
  assert.equal(email.length, EMAIL_MAX_LENGTH + 1);
  assert.equal(isValidEmail(email), false);
});

test("EMAIL_PATTERN has no leading ^ / trailing $ anchor (the browser's native <input pattern> implicitly wraps it in ^(?:...)$ — a literal anchor left in changes what the attribute matches). Note: `[^\\s@]` character classes legitimately contain '^' mid-string — only the outer anchors are forbidden.", () => {
  assert.equal(EMAIL_PATTERN.startsWith("^"), false);
  assert.equal(EMAIL_PATTERN.endsWith("$"), false);
});

test("EMAIL_PATTERN accepts/rejects the exact same strings as EMAIL_RE, including the one-character TLD", () => {
  const anchored = new RegExp(`^(?:${EMAIL_PATTERN})$`);
  const cases = [
    "ala@test.pl",
    "ala+loyalty@test.pl",
    "a@b.c",
    "ala.test.pl",
    "ala@testpl",
    "ala test@test.pl",
    "",
  ];
  for (const value of cases) {
    assert.equal(anchored.test(value), EMAIL_RE.test(value), `EMAIL_PATTERN diverged from EMAIL_RE for ${JSON.stringify(value)}`);
  }
});

test("isValidName: accepts an ordinary name", () => {
  assert.equal(isValidName("Ala"), true);
});

test("isValidName: rejects empty string", () => {
  assert.equal(isValidName(""), false);
});

test("isValidName: rejects whitespace-only input, same as the server's .trim()", () => {
  assert.equal(isValidName("   "), false);
});

test(`isValidName: accepts exactly ${NAME_MAX_LENGTH} characters`, () => {
  assert.equal(isValidName("a".repeat(NAME_MAX_LENGTH)), true);
});

test(`isValidName: rejects ${NAME_MAX_LENGTH + 1} characters`, () => {
  assert.equal(isValidName("a".repeat(NAME_MAX_LENGTH + 1)), false);
});
