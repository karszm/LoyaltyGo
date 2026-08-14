// validate.test.ts — table of the cases that matter: the mirror must accept everything the
// server (public-api/index.ts EMAIL_RE) accepts, and reject everything it rejects, with zero
// daylight between them (task-8-brief.md's "never stricter than the server" rule).

import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, isValidEmail, isValidName } from "./validate.ts";

test("isValidEmail: accepts an ordinary address", () => {
  assert.equal(isValidEmail("ala@test.pl"), true);
});

test("isValidEmail: accepts a plus-tagged address (server regex has no such restriction)", () => {
  assert.equal(isValidEmail("ala+loyalty@test.pl"), true);
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
