/*
 * Jest config for the PR gate's e2e step.
 *
 * Why a second config exists at all. `npm test` uses the jest block in
 * package.json, whose `rootDir` is `src`. Every file under `test/` therefore sat
 * outside the PR gate: 26 `*.e2e-spec.ts` suites and 11 `org-isolation/*.spec.ts`
 * suites — the entire multi-tenancy isolation net — were never executed by CI.
 * `test:e2e` could run them, but 11 suites are red (52 failures) with legacy
 * expectations written before multi-tenancy, so wiring `test:e2e` straight into
 * CI would have produced a step that fails on every PR forever. A step that
 * always fails is a step everyone learns to ignore, so it would have bought
 * nothing.
 *
 * Why an exclusion list rather than an inclusion list. Both make the same suites
 * run today. The difference is what happens to a suite added tomorrow: an
 * inclusion list would silently leave it out of the gate, which is exactly the
 * hole this config exists to close. Excluding the known-red files instead means
 * new work is gated by default and the list can only ever shrink.
 *
 * The list below is the complete inventory of pre-existing failures, with the
 * failure count observed on release/cutover-2026-08-21 at d9c293b. Do not add to
 * it to make a red build green: a new failure is a regression, and that is the
 * whole point of the step. Removing an entry requires only that its suite pass —
 * which for the ten legacy suites means updating fixtures to the multi-tenant
 * schema (organization scoping on every factory), and for oauth-coverage means
 * annotating the endpoints it reports as missing @RequiredScopes /
 * @NoOAuthAccess. When the list reaches empty, delete this file and point CI at
 * `test:e2e`.
 */
const fs = require('fs');
const path = require('path');
const base = require('./jest-e2e.json');

/** Suites red before this branch. Counts are failing tests, not suites. */
const KNOWN_RED = [
  'appointments.e2e-spec.ts', // 5  — legacy fixtures, pre multi-tenancy
  'auth.e2e-spec.ts', // 1
  'curaciones.e2e-spec.ts', // 7
  'cycles.e2e-spec.ts', // 4
  'dashboard.e2e-spec.ts', // 8
  'inventory.e2e-spec.ts', // 2
  'patients.e2e-spec.ts', // 12
  'reports.e2e-spec.ts', // 2
  'throttler.e2e-spec.ts', // 2
  'users.e2e-spec.ts', // 8
  'oauth/oauth-coverage.e2e-spec.ts', // 1 — endpoints missing scope annotations
];

// Fail fast if an entry no longer matches a real file: a rename would otherwise
// silently widen the gate's blind spot back out.
for (const rel of KNOWN_RED) {
  if (!fs.existsSync(path.join(__dirname, rel))) {
    throw new Error(
      `jest-e2e-ci.cjs lists '${rel}', which does not exist. If the suite was ` +
        `renamed, update the entry; if it was deleted or fixed, remove it.`,
    );
  }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// testRegex and testMatch are mutually exclusive, so the inherited regex goes.
// It also only matched `.e2e-spec.ts`, which is why org-isolation/*.spec.ts ran
// under no config at all.
const { testRegex, ...inherited } = base;

module.exports = {
  ...inherited,
  testMatch: ['<rootDir>/**/*.e2e-spec.ts', '<rootDir>/org-isolation/*.spec.ts'],
  testPathIgnorePatterns: KNOWN_RED.map((rel) => `<rootDir>/${escape(rel)}$`),
};
