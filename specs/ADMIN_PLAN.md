# Admin Interface — Implementation Plan

Status: **planning only** — no application code has been written against this
plan yet. Each phase below is meant to be picked up independently (by this or
another session) and should end with `npm run check`, `npm test`, and
`npm run build` passing before moving to the next phase.

**Read `AGENTS.md` before starting any phase.** It defines this repository's
readability and defensive-coding rules — in particular, every validation and
authorization decision in this plan is designed to happen **exactly once, at
one boundary**, with everything downstream trusting the result rather than
re-checking it. Where a phase below says "middleware validates X", that is a
structural requirement, not a suggestion: handlers, repositories, and tests
should not add a second check for the same thing "just in case."

## Goal

Add a `/admin` web application that lets an authenticated staff member manage
**their own** short links: list, create, edit, and delete. Authentication and
authorization at the edge is Cloudflare Access; the Worker additionally
verifies the caller's identity and email-domain membership before touching
data. Links continue to resolve at `/l/:linkId` from KV exactly as they do
today — D1 becomes the admin system of record, and KV remains the
low-latency redirect cache that Phase 1 already built.

## Non-goals (first pass)

- No roles/admin-of-admins — every authenticated, domain-matched user has the
  same permissions over their own links.
- No custom/vanity slugs — link IDs stay auto-generated base62 from the D1
  `links.id` primary key, matching the existing `/l/:linkId` 8-character
  contract.
- No link analytics/click tracking.
- No soft-delete/undo — `DELETE` is permanent in this phase.
- No background reconciliation job between D1 and KV — writes are
  synchronous and best-effort-consistent (see Phase 3 concurrency notes).

## Key decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Database | D1, binding name `DB` | `cloudflare.config.ts` already uses the `bindings.*()` helpers (`bindings.kv()` for `LINKS`); `bindings.d1({ name })` follows the same auto-provisioning pattern — no database ID is committed, `cf deploy`/`cf dev` create and bind it. |
| Migrations | Hand-rolled, tracked in a `_migrations` D1 table | The `cf` CLI (this repo's deploy tool, not Wrangler) has no `d1 migrations` subcommand — only `cf d1 query`/`import`/`export`. A small `scripts/db/migrate.mjs` applies numbered `.sql` files in order and records each in `_migrations`, the same idea as Wrangler's own migrations table but implemented against `cf d1 query` (remote/local) and `D1Database#exec()` (tests). |
| Link ID encoding | Base62-encode the D1 `links.id` autoincrement integer on read; never store the encoded ID | Keeps a single source of truth (the integer PK) and reuses the existing 8-character `linkIdPattern` contract in `src/worker/routes/links.ts`. A pure `encodeBase62`/`decodeBase62` pair is unit-tested in isolation. |
| Authn/authz | `cloudflareAccess()` for **authentication** (proves the request carries a real, signed Access identity) + a single `requireAllowedDomain` middleware for **authorization** (the identity's email domain matches `ACCESS_ALLOWED_EMAIL_DOMAIN`) | These are two different concerns, each checked exactly once, in exactly one place. `access.config.ts` deliberately does **not** also encode an email-domain rule — the domain allowlist lives in one system (this Worker's own config/code), not two, so there is nothing to keep in sync and nothing for a handler or repository to "double check" afterward. |
| Ownership model | `links.owner_email` column, always taken from the verified Access identity, never from client input | Prevents a client from ever creating/editing a link "as" someone else. |
| Concurrency control | Optimistic concurrency via a `links.version` integer, `If-Match`-style version check on `PUT`/`DELETE` | The prompt explicitly calls out protecting against concurrent writers "even though they technically can't right now" — optimistic locking is cheap, testable, and future-proofs multi-tab/multi-device editing by the same user. |
| Validation | `valibot` schemas in a dedicated `src/worker/schemas/` module | Small, tree-shakeable, already the requested library; schemas are unit-tested independently of HTTP wiring. |
| Errors | `@adrianhall/cloudflare-toolkit/errors` generators + `problemDetailsErrorHandler` | Matches toolkit usage guidance; `409 Conflict` (not in the toolkit's v1 generator set) is constructed once via `problemDetails()` from `/problem-details` and reused. |
| Logging | `cloudflareLogger()` + `c.get('LOGGER')` in every handler and repository call site that can fail | Consistent with toolkit guidance; structured logs make ownership-violation attempts and version conflicts observable. |
| UI framework | Vue 3 + `<script setup>` (Composition API), **not React** | Matches the explicit constraint; this repo already has first-class Vue tooling/skills available, and Vue's SFC + reactivity model is a good fit for a small CRUD admin screen without extra state-management ceremony. |
| Coverage | `@vitest/coverage-istanbul` | Cloudflare's own Vitest-pool-workers docs state V8 coverage is unsupported in the Workers runtime and Istanbul is required. |

## Repository layout after all phases

```text
db/
  migrations/
    0001_create_links.sql
scripts/
  db/
    migrate.mjs                 # applies pending migrations (local + remote)
src/
  worker/
    lib/
      base62.ts                 # encode/decode helpers (pure functions)
    schemas/
      links.ts                  # valibot schemas for create/update payloads
    repositories/
      links-repository.ts       # LinksRepository interface + D1 implementation
    routes/
      links.ts                  # existing public redirect route (unchanged)
      admin/
        links.ts                # /api/admin/links CRUD routes
        me.ts                   # /api/admin/me identity endpoint
    middleware/
      require-allowed-domain.ts # sole email-domain authorization check
    index.ts                    # wires cloudflareAccess/logger/error handling
  client/
    admin/
      index.html                # second Vite entry point
      main.ts
      App.vue
      api/
        links.ts                # typed fetch client for /api/admin/links
      components/
        LinkList.vue
        LinkForm.vue
        ConfirmDialog.vue
tests/
  worker/
    lib/base62.test.ts
    schemas/links.test.ts
    repositories/links-repository.test.ts
    routes/admin-links.test.ts
    routes/admin-me.test.ts
    middleware/require-allowed-domain.test.ts
  client/
    admin/
      App.test.ts
      LinkList.test.ts
      LinkForm.test.ts
```

---

## Phase 0 — Wiring and configuration (prerequisite for every later phase)

**Scope:** no business logic yet — just the shared plumbing every later phase
depends on.

1. `cloudflare.config.ts`: add `DB: bindings.d1({ name: 'briefly-admin' })`
   alongside the existing `LINKS` KV binding. Do **not** hardcode a database
   ID, matching how `LINKS` is left to auto-provision.
2. Regenerate `worker-configuration.d.ts` (via `npm run dev` or `cf build`,
   whichever this project's toolchain does automatically today — confirm by
   inspecting how `LINKS` first appeared in that file) and commit it, exactly
   like the existing KV binding.
3. `access.config.ts`: add a **second** self-hosted Access application scoped
   to the admin surface only:
   - A new `AccessPolicy` (e.g. `Allow authenticated staff`) with `decision:
     'allow'` and an `include` rule that only requires a valid identity from
     the configured identity provider (e.g. `{ everyone: {} }`, same shape
     already used by "Briefly bypass everyone" — the difference is
     `decision: 'allow'` instead of `'bypass'`, so Access still requires a
     login, it just doesn't also encode an email-domain condition).
   - Deliberately **do not** add an email-domain rule here. The domain
     allowlist (`ACCESS_ALLOWED_EMAIL_DOMAIN`) is enforced in exactly one
     place — the Worker's `requireAllowedDomain` middleware (Phase 3) — so
     it is defined once, versioned with the app, and covered by ordinary
     unit tests instead of living in Access policy JSON that the app cannot
     assert against. Access's job here is strictly "is this a real,
     logged-in identity"; "is this identity allowed to manage links" is the
     Worker's job.
   - A new `AccessApplication` whose `destinations` scope to the admin paths
     only, e.g. `{ type: 'public', uri: '<hostname>/admin*' }` and a matching
     entry for `<hostname>/api/admin*`, each referencing the new policy.
   - Leave the existing "Briefly bypass everyone" policy/application for the
     public marketing site and `/l/*` untouched.
   - Run `npm run postdeploy` (`cf-access-policy apply`) only from a real
     deploy, never from a dev machine against production by accident —
     confirm the plan/diff output before typing `--yes` manually if run
     ad hoc.
4. `vite.config.ts`: wire `cloudflareAccessPlugin` from
   `@adrianhall/cloudflare-toolkit/vite` **before** the `cloudflare()` plugin,
   passing the same path-scoped policy list the Worker will use in step 6, so
   `npm run dev` can emulate an Access login for `/admin` and `/api/admin/*`.
5. `.env.example`: document that `ACCESS_ALLOWED_EMAIL_DOMAIN` is no longer
   "reserved for a future policy" but actively used; no new variables should
   be required — reuse the existing one and `CLOUDFLARE_TEAM_DOMAIN` if
   `cloudflareAccess()` needs it (check whether a team-domain var already
   exists or needs adding to `.env.example` and `cloudflare.config.ts` `vars`).
6. `src/worker/index.ts`: introduce the shared `AppVariables` type
   (`CloudflareToolkitVariables`), wire `cloudflareLogger()` globally, wire
   `cloudflareAccess()` with:
   - `policies: [{ pattern: /^\/(api\/)?admin(\/.*)?$/, authenticate: true, audience: <admin app aud> }, { pattern: /.*/, authenticate: false }]`
     (exact regex to be finalized once route paths are locked down in Phase
     3; `/l/*` and the public site stay unauthenticated).
   - `enableDevTokens: import.meta.env.DEV`.
   - `defaultAction: 'bypass'` for anything not matched, since today's
     redirect and marketing routes remain intentionally public.
   - `app.onError(problemDetailsErrorHandler({ includeStack: import.meta.env.DEV }))`
     and `app.notFound(notFoundHandler())`.
7. `package.json`: `hono`'s existing dependency is already present; add
   `valibot` and `@hono/valibot-validator` as runtime dependencies (Phase
   2/3 use `vValidator()` as route middleware, not in-handler parsing — see
   Phase 3); add `@vitest/coverage-istanbul` and (for Phase 4) `vue` +
   `@vue/test-utils` as dev dependencies once their phases start, not all up
   front, to keep each phase's diff scoped.

**Tests for this phase:** none beyond `npm run check` passing (types/lint) —
this phase is config-only. A smoke test can assert `/admin` and
`/api/admin/*` return `401` with no Access identity and no dev token, and
`bypass` still applies to `/` and `/l/*`.

**Exit criteria:** `npm run dev` shows an Access dev-login form when
visiting `/admin`; unauthenticated `curl` against `/api/admin/anything`
returns `401`; `/`, `/l/:linkId` behavior is unchanged.

---

## Phase 1 — Database schema and migrations

**Scope:** D1 schema, migration tooling, no application code reads/writes it
yet beyond the migration runner itself.

### Schema (`db/migrations/0001_create_links.sql`)

```sql
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_email TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_links_owner_email ON links (owner_email);
```

Notes:

- `owner_email` is stored lower-cased and trimmed by the repository layer
  (Phase 2), not by a SQL constraint, so the validation rule is unit-testable
  in TypeScript.
- `version` starts at `1` and is incremented by the repository on every
  successful `UPDATE`, never by client input.
- No `slug`/vanity column in this phase (see Non-goals).
- `id` is the integer that `src/worker/lib/base62.ts` (Phase 2) encodes into
  the public 8-character link ID; verify base62-encoded IDs from
  realistic ID ranges stay within the existing `/^[0-9A-Za-z]{8}$/u` pattern
  in `src/worker/routes/links.ts` (they will, up to a very large integer —
  confirm the max safe `id` before it would overflow 8 base62 characters and
  decide whether to left-pad or accept variable length; the existing pattern
  requires exactly 8 characters, so padding is almost certainly required —
  resolve this before writing `base62.ts`).

### Migration runner (`scripts/db/migrate.mjs`)

A small Node script (ESM, no new heavy dependency) that:

1. Reads `db/migrations/*.sql` in filename order.
2. Ensures a `_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
   bookkeeping table exists.
3. Determines which migration filenames are not yet recorded.
4. Applies each pending file's full contents via `cf d1 query <database-id>
   --sql "<contents>"` (remote) or the same command with `--local
   --local-endpoint <url>` (local dev against the Miniflare instance created
   by `cf dev`), then records it in `_migrations`.
5. Supports `--database-id`, `--local`, `--local-endpoint`, and `--dry-run`
   flags; resolves the remote database ID via `cf d1 list` filtered by the
   `briefly-admin` name if not passed explicitly.

Wire it into `package.json`:

```jsonc
"db:migrate": "node scripts/db/migrate.mjs",
"db:migrate:local": "node scripts/db/migrate.mjs --local --local-endpoint http://localhost:5173"
```

Document both in the README's "Local development" and "Deployment"
sections, mirroring how KV seeding is already documented there.

### Test-time migrations

`@cloudflare/vitest-pool-workers` tests get a fresh D1 instance per the
existing `miniflare` block in `tests/worker/vitest.config.ts`. Add:

```ts
miniflare: {
  compatibilityDate: '2026-08-18',
  compatibilityFlags: ['nodejs_compat'],
  kvNamespaces: ['LINKS'],
  d1Databases: ['DB'],
},
```

Add a Vitest `setupFiles` entry (e.g. `tests/worker/setup/migrate-d1.ts`)
that runs once per test file, reads every file in `db/migrations/` (Node
`fs`, since setup files run outside the Workers runtime per Cloudflare's own
"Importing modules from global setup file" known issue — confirm this file
runs in the correct environment; if it must run inside the Workers runtime
instead, use a `beforeAll` in each test file calling `env.DB.exec(sql)`
directly), and applies each migration's SQL via `env.DB.exec(sql)` (D1
`exec()` accepts a `;`-separated batch of statements with no bound
parameters — sufficient for DDL).

**Tests for this phase:**

- `tests/worker/migrations.test.ts`: after the setup-file migration runs,
  assert `sqlite_master`/`PRAGMA table_info(links)` shows the expected
  columns, and that `_migrations` contains `0001_create_links.sql`.
- Optionally a Node-side unit test for `scripts/db/migrate.mjs`'s pure parts
  (filename ordering, "which migrations are pending" diffing logic) that
  does not require a real `cf` binary — extract that logic into a testable
  function separate from the `cf d1 query` shell-out.

**Exit criteria:** `npm run db:migrate:local` against a fresh `cf dev`
session creates the `links` table; `npm test` passes with the new D1 binding
and migration setup file in place; existing KV-based redirect tests are
unaffected.

---

## Phase 2 — Repositories

**Scope:** typed data-access layer over D1. No HTTP routes yet.

### `src/worker/lib/base62.ts`

- `encodeBase62(id: number): string` — fixed-width, left-padded to 8
  characters using the `0-9A-Za-z` alphabet already implied by
  `linkIdPattern`.
- `decodeBase62(linkId: string): number | null` — returns `null` (not a
  throw) for malformed input so callers can turn it into a `404` via
  `notFound()` at the route layer, keeping the pure function free of
  HTTP/problem-details concerns.
- Property-based/table-driven unit tests: round-trip `encode(decode(x)) ===
  x` for a range of small and large integers, reject out-of-alphabet
  characters, reject wrong-length strings, confirm padding behavior for
  small IDs (e.g. `id = 1`).

### `src/worker/schemas/links.ts` (valibot)

- `createLinkSchema`: `{ destinationUrl: string }` — `v.pipe(v.string(),
  v.url(), v.maxLength(2048))` (or equivalent), rejecting `javascript:` and
  other non-`http(s)` schemes explicitly (valibot's `v.url()` alone does not
  restrict scheme — add a custom `v.check()` for `http:`/`https:` only).
- `updateLinkSchema`: `{ destinationUrl: string, version: number }` — same
  URL rule, `version` is `v.pipe(v.number(), v.integer(), v.minValue(1))`.
- `deleteLinkQuerySchema`: `{ version: string }` coerced with
  `v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1))` — the
  query-string form of the same `version` rule, since query parameters
  always arrive as strings.
- Exported inferred TypeScript types via `v.InferOutput<...>` for reuse in
  the repository and route layers — the repository layer's function
  signatures take these inferred types directly, so there is no second,
  hand-written interface for the "same" shape to drift out of sync with the
  schema.
- Unit tests covering valid input, invalid schemes, oversize input, and
  missing/non-integer `version`.

### `src/worker/repositories/links-repository.ts`

```ts
export interface LinkRecord {
  id: number;
  linkId: string; // base62-encoded id, computed at read time
  ownerEmail: string;
  destinationUrl: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinksRepository {
  listByOwner(ownerEmail: string): Promise<LinkRecord[]>;
  getByIdForOwner(ownerEmail: string, id: number): Promise<LinkRecord | null>;
  create(ownerEmail: string, destinationUrl: string): Promise<LinkRecord>;
  updateForOwner(
    ownerEmail: string,
    id: number,
    destinationUrl: string,
    expectedVersion: number,
  ): Promise<LinkRecord>; // throws a 404-shaped error if absent, 409-shaped on version mismatch
  removeForOwner(ownerEmail: string, id: number, expectedVersion: number): Promise<void>;
}

export function createD1LinksRepository(db: D1Database): LinksRepository { ... }
```

Concurrency-safety details:

- `updateForOwner`/`removeForOwner` run a single `UPDATE ... WHERE id = ? AND
  owner_email = ? AND version = ?` / `DELETE ... WHERE id = ? AND owner_email
  = ? AND version = ?` statement and inspect the D1 `meta.changes` (or
  `rowsWritten`, confirm the exact field name against
  `@cloudflare/workers-types`) result.
  - `0` rows changed + a row exists for that `id`/`owner_email` with a
    different version → throw the shared `conflict()` helper (409, built via
    `problemDetails()` once in `src/worker/errors/conflict.ts` since the
    toolkit has no `409` generator).
  - `0` rows changed + no row exists for that `id`/`owner_email` at all →
    throw `notFound()`.
  - Distinguishing these two cases requires a follow-up `SELECT` (or a
    single `UPDATE ... RETURNING` if D1's SQLite version supports it —
    confirm support before relying on it; fall back to select-then-update in
    a single D1 **batch** if `RETURNING` isn't reliable, so the check and
    write stay atomic from the Worker's perspective even though D1 batches
    are not full ACID transactions).
- Every row read that "must" exist (e.g. immediately after a successful
  insert) uses `throwIfNull` from `/guards` rather than a hand-rolled null
  check, per toolkit convention.
- All queries are parameterized (`.bind(...)`) — never string-concatenated —
  standard D1/SQL-injection hygiene, doubly important here since
  `owner_email` and `destinationUrl` are user-influenced.

**Tests for this phase (`tests/worker/repositories/links-repository.test.ts`),
run against the real D1 binding via `cloudflare:test`'s `env.DB`:**

- `create` returns a row with `version === 1` and a correctly-padded
  `linkId`.
- `listByOwner` only returns rows for that exact owner email, never another
  owner's rows, even when both exist in the same test's D1 instance.
- `getByIdForOwner` returns `null` (not a thrown error) for another owner's
  id, so the route layer can turn "exists but not yours" and "does not
  exist" into the same `404` without leaking existence.
- `updateForOwner` with the correct `expectedVersion` succeeds and bumps
  `version` to `2`, updates `updatedAt`, and leaves `createdAt` untouched.
- `updateForOwner` with a stale `expectedVersion` throws the `409` conflict
  error and leaves the row unchanged (assert via a follow-up read).
- `updateForOwner`/`removeForOwner` for an id owned by a different user
  throws `404`, not `403` — do not confirm-or-deny another user's link
  exists.
- Concurrent-write simulation: fire two `updateForOwner` calls with the same
  stale `expectedVersion` via `Promise.allSettled`; assert exactly one
  succeeds and the other receives the `409` conflict.

**Exit criteria:** repository test suite passes in isolation with 100%
branch coverage of `links-repository.ts` and `base62.ts` once Istanbul is
wired in Phase 5 (or run `c8`/manual inspection earlier if coverage tooling
isn't wired yet).

---

## Phase 3 — API

**Scope:** Hono routes under `/api/admin/*`, wired to the Phase 2
repository, protected by the Phase 0 `cloudflareAccess` policy.

### `src/worker/middleware/require-allowed-domain.ts`

- One Hono middleware, mounted once on the `/api/admin/*` router group
  (after `cloudflareAccess()`, before every admin route handler). It reads
  `c.get('Cloudflare_Access_Identity').email`, extracts the domain after
  `@`, compares case-insensitively against `c.env.ACCESS_ALLOWED_EMAIL_DOMAIN`,
  and throws `forbidden()` on mismatch.
- This is the **only** place the domain rule is evaluated. Route handlers,
  the repository layer, and the UI all trust `c.get('Cloudflare_Access_Identity')`
  once execution reaches them — none of them re-check the domain, re-parse
  the email, or add a fallback "just in case" branch for an identity that
  shouldn't structurally be able to reach that code anymore. If a future
  change needs the domain check somewhere else, that is a sign the
  middleware is mounted in the wrong place, not a reason to duplicate the
  check.
- Independently unit-testable without standing up real Access
  infrastructure (use `signDevJwt` from `/testing` with different email
  domains).
- `ACCESS_ALLOWED_EMAIL_DOMAIN` must be added to `cloudflare.config.ts`'s
  `vars` (or wherever plain-text config vars are declared for this
  Worker — confirm the `bindings`/`vars` API for a plain string var) so it is
  available as `c.env.ACCESS_ALLOWED_EMAIL_DOMAIN` at runtime, not only at
  `cf-access-policy apply` time.

### `src/worker/routes/admin/me.ts`

- `GET /api/admin/me` → `{ email: string }` from the verified identity. Lets
  the UI greet the user and avoids re-deriving identity client-side from a
  cookie it cannot read.

### `src/worker/routes/admin/links.ts`

Body/query validation is wired as route-level middleware via
`@hono/valibot-validator`'s `vValidator()`, not as an in-handler
`schema.parse(await c.req.json())` call. This keeps the same "boundary
validates once, handler trusts the result" shape as `requireAllowedDomain`:
a handler that only runs after `vValidator('json', createLinkSchema)` reads
`c.req.valid('json')` and treats it as already-correct — no re-checking the
URL scheme, no re-checking `version`'s type, no defensive `??` fallback for
a field the schema already guarantees is present.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/admin/links` | `listByOwner(identity.email)`, mapped to a JSON array of `{ linkId, destinationUrl, version, createdAt, updatedAt }` (never expose the raw integer `id`). |
| `POST` | `/api/admin/links` | `vValidator('json', createLinkSchema)` middleware, then `create(...)` using `c.req.valid('json')` directly; on success, `LINKS.put(linkId, destinationUrl)` (KV write), return `201` with the created record. |
| `GET` | `/api/admin/links/:linkId` | `decodeBase62`; `404` on decode failure; `getByIdForOwner`; `404` if absent. |
| `PUT` | `/api/admin/links/:linkId` | `vValidator('json', updateLinkSchema)` middleware, then `updateForOwner(...)` using `c.req.valid('json')` directly; on success, `LINKS.put(linkId, destinationUrl)`; return the updated record. |
| `DELETE` | `/api/admin/links/:linkId` | `vValidator('query', deleteLinkQuerySchema)` middleware validates the required `version` query parameter (rejecting a missing/non-integer value with `400` before the handler runs); handler calls `removeForOwner(...)` using `c.req.valid('query').version` directly; on success, `LINKS.delete(linkId)`; return `204`. |

Ordering and dual-write notes (documented inline in code comments, since this
is the trickiest correctness detail in the whole feature):

- D1 is always written **first**, KV **second**, on both create and update.
  If the KV write throws after a successful D1 write, log an `error` with
  the full context (`ownerEmail`, `linkId`, operation) via `c.get('LOGGER')`
  and still return success to the client for the D1 half — the redirect
  route will serve a stale/missing KV entry until the next successful write
  or a manual reconciliation, which is an acceptable first-pass trade-off
  explicitly called out as a Non-goal (no background reconciliation job).
  Do not attempt to "roll back" the D1 write on a KV failure — D1 is the
  source of truth and must never be made to lie about what the admin UI just
  did.
- `DELETE` deletes the KV key **after** the D1 row is gone, so a
  simultaneous `GET /l/:linkId` never sees "deleted in D1 but still resolves
  from KV" for longer than necessary, and if the D1 delete fails outright
  (e.g. version conflict), the KV entry is correctly left untouched.
- The version-conflict (`409`) response body should include the current
  server-side record (or at least its `version` and `destinationUrl`) so the
  UI can offer "reload and try again" without a second round trip.

**Tests for this phase (`tests/worker/routes/admin-links.test.ts`,
`admin-me.test.ts`, `require-allowed-domain.test.ts`), using `signDevJwt` +
`JWT_HEADER`/cookie helpers from `/testing`:**

- No JWT / wrong audience → `401` on every `/api/admin/*` route.
- Valid JWT, wrong email domain → `403` from `requireAllowedDomain`, even
  though the JWT itself is valid (simulate by signing a dev JWT for an email
  outside `ACCESS_ALLOWED_EMAIL_DOMAIN`).
- Valid JWT, allowed domain, empty link list → `GET /api/admin/links`
  returns `[]`.
- `POST` with an invalid URL/scheme → `422` with a `problem+json` body
  naming the offending field.
- `POST` happy path → `201`, D1 row exists, `LINKS.get(linkId)` resolves to
  the same destination, and a subsequent `GET /l/:linkId` (via the existing
  public route/app) redirects correctly — an end-to-end assertion tying
  Phase 1's redirect route to the new admin write path.
- `PUT`/`DELETE` on another user's `linkId` → `404`, and the other user's
  row/KV entry is provably unchanged afterward.
- `PUT` with a stale `version` → `409`, KV entry unchanged.
- `DELETE` without a `version` query param → `400` (missing required
  parameter) rather than silently defaulting to something unsafe.
- `DELETE` happy path → `204`, subsequent `GET /l/:linkId` on the same ID →
  `404`.

**Exit criteria:** full CRUD lifecycle exercised end-to-end in tests without
a real Cloudflare Access deployment; `npm run check` and `npm test` green;
manual smoke test via `npm run dev` + the Vite Access emulation login form
confirms the same behavior against a live Miniflare session.

---

## Phase 4 — UI (Vue 3, `/admin`)

**Scope:** a small, framework-appropriate SPA served as static assets at
`/admin`, calling the Phase 3 API.

### Build wiring

- Add `vue` as a runtime dependency; add it to `vite.config.ts` as a second
  Rollup input (`build.rollupOptions.input`) alongside the existing
  `src/client/index.html`, or confirm whether this project's `cf build`
  wrapper needs its own multi-entry configuration — resolve this mechanically
  before writing components, since an admin SPA that isn't actually part of
  the asset build is a wasted phase.
- `src/client/admin/index.html` is a minimal HTML shell (`<div id="app">`)
  mirroring the existing `index.html`'s `<head>`/meta conventions but with
  its own `<title>` (e.g. "Briefly Admin").
- `src/client/admin/main.ts` creates and mounts the Vue app.
- `cloudflare.config.ts`'s `assets.runWorkerFirst` already includes
  `/api/*`; confirm `/admin` itself does **not** need to be added (it should
  be served as a static SPA shell and left out of `runWorkerFirst`, since
  Access — not the Worker's Hono routing — is what actually gates it before
  the asset even loads, and `cloudflareAccess`'s own path policy governs the
  small number of admin API calls the shell makes).

### Components

- `App.vue`: top-level shell — fetches `GET /api/admin/me` on mount to greet
  the user (and to detect an expired/invalid session early), renders
  `LinkList.vue`.
- `LinkList.vue`: fetches `GET /api/admin/links`, renders a table/list with
  destination URL, created/updated timestamps, and Edit/Delete actions per
  row; an "Add link" action opens `LinkForm.vue` in create mode.
- `LinkForm.vue`: a single form reused for create and edit, `v-model`-bound
  to `destinationUrl`; on submit, `POST` (create) or `PUT` (edit, sending
  the `version` captured when the row was loaded); surfaces field-level
  validation errors from the API's `problem+json` response, and specifically
  surfaces a `409` as "This link changed elsewhere — reload and try again"
  with a one-click reload-and-retry affordance rather than a generic error.
- `ConfirmDialog.vue`: reusable confirmation before `DELETE`, since deletion
  is permanent in this phase.
- `api/links.ts`: a thin typed `fetch` wrapper (`listLinks`, `createLink`,
  `updateLink`, `deleteLink`, `getMe`) that centralizes error handling —
  parsing `application/problem+json` bodies into a typed `ApiError` the
  components can branch on (`status`, `title`, `detail`).

### Local development

- `cloudflareAccessPlugin` (wired in Phase 0) serves a dev login form when
  visiting `/admin` under `npm run dev`; document the login flow (which
  email to use to satisfy `ACCESS_ALLOWED_EMAIL_DOMAIN` in local dev) in the
  README.

**Tests for this phase (`tests/client/admin/*.test.ts`, jsdom + Vue Test
Utils):**

- `App.vue` renders the greeting once `GET /api/admin/me` resolves (mock
  `fetch`).
- `LinkList.vue` renders one row per link and calls the delete API (via a
  mocked `api/links.ts` module) only after `ConfirmDialog.vue` confirms.
- `LinkForm.vue` in create mode calls `POST` with the entered URL; in edit
  mode calls `PUT` with the pre-loaded `version`; shows the API's validation
  `detail` message on `422`; shows the conflict-specific message on `409`.
- A minimal happy-path integration test: mount `App.vue` with a mocked
  `fetch` sequence (`me` → `list` → `create` → `list` again) and assert the
  new link appears without a full page reload.

**Exit criteria:** `npm run test:client` covers the new components;
`npm run build` produces both the marketing site and `/admin` bundles;
manual `npm run dev` walkthrough: log in via the Access emulation form,
create a link, confirm `/l/:linkId` redirects, edit it, confirm the
redirect destination changed, delete it, confirm `/l/:linkId` now 404s.

---

## Phase 5 — Coverage (Istanbul) and hardening pass

**Scope:** wire coverage reporting across both Vitest projects and do a
final cross-cutting review.

1. Add `@vitest/coverage-istanbul` as a dev dependency, matched to the
   installed `vitest` major/minor (confirm exact compatible version at
   install time — Cloudflare's Vitest-pool-workers docs mandate Istanbul
   over V8 because V8 coverage is not supported inside the Workers runtime).
2. In the root `vitest.config.ts`, add:
   ```ts
   test: {
     projects: [...],
     coverage: {
       provider: 'istanbul',
       reporter: ['text', 'html', 'lcov'],
       include: ['src/**/*.ts'],
       exclude: [
         'src/worker/tsconfig.json',
         'src/client/tsconfig.json',
         '**/*.d.ts',
       ],
       thresholds: {
         // Set once a real baseline exists from Phases 1-4; do not invent
         // numbers here — run `npm run test:coverage` once everything above
         // is implemented and set thresholds slightly below the achieved
         // numbers so CI fails on regressions, not on aspirational targets.
       },
     },
   }
   ```
3. Add an npm script: `"test:coverage": "vitest run --config
   vitest.config.ts --coverage"`.
4. Add `npm run test:coverage` to `.github/workflows/ci.yml` (either
   replacing or running alongside the existing `npm test` step — replacing
   is simpler and avoids running the suite twice).
5. Add coverage output directories to `.gitignore` (e.g. `coverage/`).
6. Cross-cutting review pass once coverage is in place:
   - Re-run the Phase 2/3 concurrent-write test under coverage to confirm
     both branches of the optimistic-lock check are actually exercised, not
     just the happy path.
   - Confirm every `throw` site in `links-repository.ts` and the admin
     routes is reachable by at least one test (Istanbul's HTML report makes
     unreached branches visible directly).
   - Confirm no `includeStack: true` or `enableDevTokens: true` is
     reachable outside a `import.meta.env.DEV`-gated branch anywhere in the
     new code, per the toolkit's anti-patterns section.
   - Confirm `oxlint`'s `typeAware` strict configuration passes on every new
     file with no blanket suppressions (any suppression must name the rule
     and include a justification, per this repo's existing convention).

**Exit criteria:** `npm run check`, `npm run test:coverage`, and `npm run
build` all pass locally and in CI; the coverage HTML report shows no
unreached branches in the new `src/worker/repositories`,
`src/worker/routes/admin`, and `src/worker/lib` code without an explicit,
justified reason.

---

## Open questions to resolve before/while implementing (do not guess silently)

1. Exact `AccessRule` shape for an "email domain" rule in
   `@adrianhall/cloudflare-toolkit`'s `AccessConfig` — inspect
   `dist/cli/access-policy` or the toolkit's own documentation site rather
   than guessing Cloudflare's raw Access API rule JSON shape.
2. Whether `cloudflareAccess()` needs `CLOUDFLARE_TEAM_DOMAIN` added to
   `cloudflare.config.ts`'s `vars` for this specific project, or whether it
   is already available some other way.
3. Whether D1's `UPDATE ... RETURNING` is reliable enough in this project's
   pinned `compatibility_date`/D1 engine version to use for the
   read-modify-write concurrency check, versus a separate `SELECT` inside a
   D1 `batch()`.
4. Exact field name (`meta.changes` vs `meta.rowsWritten` vs similar) on the
   `D1Result` returned by this project's pinned `@cloudflare/workers-types`
   version for detecting "zero rows affected."
5. Whether this project's `cf`/`@cloudflare/vite-plugin` toolchain
   regenerates `worker-configuration.d.ts` automatically on `npm run dev`
   /`cf build`, or whether a manual step is needed — confirm by adding the
   `DB` binding and observing, rather than assuming parity with the
   Wrangler-based `generate-wrangler-types` flow documented in the
   `cloudflare-deploy-scripts` skill (which this project does **not** use).
6. Final `DELETE` version-conveyance convention (`?version=` query string is
   recommended above) — confirm it reads cleanly against this project's
   existing route-parameter/query-parsing conventions before committing to
   it across both the API and the Vue client.
