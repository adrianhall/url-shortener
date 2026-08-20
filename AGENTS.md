# AGENTS.md

Instructions for any coding agent (or human) working in this repository.
Read this before writing or reviewing code, and especially before
implementing anything from `specs/*.md`.

## Project shape

- Cloudflare Worker (Hono) + Vite-built static assets, deployed with `cf`
  (not Wrangler directly — see `cloudflare.config.ts`, `access.config.ts`).
- `@adrianhall/cloudflare-toolkit` provides logging, RFC 9457 problem
  details, and Cloudflare Access verification. Consult its skill/docs before
  reinventing any of these.
- TypeScript strict mode everywhere; `oxlint` runs with `typeAware: true`
  and `denyWarnings: true`. `npm run check` must pass with zero suppressions
  that aren't individually justified.

## Coding Style & Readability

Code in this repository is read far more often than it is written, as it is
designed to be a demonstration app that demonstrates coding for Cloudflare at
it's most basic. Every rule below exists to keep the **happy path visible at
a glance** and to make sure a security or logic bug would actually be visible
in review instead of buried in defensive noise.

### 1. Trust the type system

- **DO** assume TypeScript strict mode is enabled and trust the compiler.
- **DO** let `vValidator()` / valibot schemas (see below) be the only place
  an external payload's shape is checked; everything after that point is a
  typed value, not `unknown`.
- **DON'T** write runtime null/type checks for internal values the compiler
  already guarantees are non-null or correctly typed. If you find yourself
  writing `if (x)` on a value typed `X` (not `X | null | undefined`), delete
  it.
- **DON'T** add a type assertion (`as X`) to silence a check that a small
  refactor could make the compiler verify for real.

### 2. Validate and authorize at exactly one boundary — never twice

This is the most important rule in this file, and the one most likely to be
violated by over-eager "defense in depth."

- **DO** put validation and authorization decisions in **middleware** (Hono
  middleware, `vValidator()`, `cloudflareAccess()`, a repo-local guard like
  `requireAllowedDomain`) and let every handler downstream **trust** the
  result without re-checking it.
- **DO** ask, before adding any check: "is this the first and only place
  this fact is verified?" If the answer is no — if a middleware, an Access
  policy, or an earlier handler already guarantees it — do not check it
  again "just in case."
- **DON'T** re-validate a request body in a handler after a `vValidator()`
  (or equivalent) middleware has already validated it. Read the validated
  value (`c.req.valid('json')`), don't re-parse `c.req.json()`.
- **DON'T** re-check an authorization decision (e.g. "does this email match
  the allowed domain?") in more than one place. If `requireAllowedDomain`
  middleware is mounted on a router, no handler, repository method, or test
  helper on that router should also branch on the caller's email domain —
  that is duplicated authorization logic with two places to get out of
  sync, not "extra safety."
- **DON'T** invent a second, independent enforcement layer for the same
  business rule in a different system (for example: encoding the same
  email-domain allowlist in both a Cloudflare Access policy _and_ Worker
  code) unless the two layers genuinely check different things. Prefer one
  authoritative place per rule, and make that place a `.ts` file with a unit
  test, not infrastructure configuration the app cannot assert against.
- **This does not forbid layered security that checks genuinely different
  things.** Cloudflare Access proving "this is a real, signed-in identity"
  and a Worker middleware proving "this identity's domain is on the
  allowlist" are two different concerns and both belong. A SQL `WHERE
owner_email = ?` in a repository method is not "re-checking" an
  authorization decision already made in middleware — it is the mechanism
  that makes per-row ownership scoping possible at all, and middleware
  structurally cannot express it. The test for whether a check belongs is
  "does this verify something no earlier layer could have," not "can it
  ever hurt to check again."

### 3. Trust the infrastructure and prior layers

- **DO** assume data is clean once it has crossed a validated boundary
  (request body after `vValidator()`, a D1 row read back after an `INSERT`,
  an Access identity after `cloudflareAccess()` has run).
- **DON'T** wrap operations that cannot throw in `try/catch`.
- **DON'T** add a fallback/default value for a case a schema, a type, or a
  routing guarantee has already ruled out. A route parameter matched by
  `linkIdPattern` does not need a second regex check inside the handler.

### 4. Fail fast, don't pad

- **DO** throw immediately (`notFound()`, `forbidden()`, `badRequest()`,
  etc. from `@adrianhall/cloudflare-toolkit/errors`) for a state that
  should not happen. `problemDetailsErrorHandler` converts it to an HTTP
  response — there is no need to catch it yourself.
- **DO** use `throwIfNull` / `sqlCount` (`@adrianhall/cloudflare-toolkit/guards`)
  for the "this D1 row must exist" pattern instead of a hand-rolled
  `if (!row) throw ...`.
- **DON'T** swallow an error to return a generic fallback ("degrade
  gracefully") for a state that indicates a real bug. A version-conflict
  `409` and a not-found `404` are legitimate, expected outcomes with tests
  of their own — an unreachable `else` branch guarding against "the
  database returned something impossible" is not.

### 5. Flatten the happy path

- **DO** use guard clauses: handle the error/edge case first, `return`/
  `throw` immediately, then let the rest of the function be the happy path
  at the lowest indentation level.
- **DON'T** nest the happy path inside `if/else` or `try/catch`. If a
  function's success path is indented three or more levels deep, restructure
  it.
- **DON'T** write a defensive branch or test for a state that is
  structurally impossible given the code that runs before it (a decoded
  base62 ID that failed its own regex check, a valibot-validated body
  missing a required field). If it is genuinely impossible, there is
  nothing to test — write the test for the boundary that prevents it
  instead (the regex, the schema).

### 6. Omit "just in case" code

- **DO** write the minimum code the current phase of `specs/*.md` actually
  requires.
- **DON'T** add speculative columns, parameters, config flags, or
  abstraction layers "for later." If a future phase needs it, that phase's
  plan will say so — add it then, with a test that exercises it.
- **DON'T** generalize a function to handle inputs nothing in this
  repository produces yet.

## Applying this to specific patterns in this repo

- **Hono routes**: validation middleware (`vValidator`) → authorization
  middleware (`cloudflareAccess`, `requireAllowedDomain`) → handler. The
  handler's body should read like the happy path only: read validated
  input, call the repository, map the result to a response. Error cases are
  `throw`s, not `if` branches that build an error response inline.
- **Repositories**: return `null` for "not found, including not yours to
  see" rather than throwing, so the route layer decides the HTTP status
  once; throw for states that indicate a genuine conflict (`409`) the
  caller must react to. Don't duplicate the route layer's `404` vs `403`
  decision inside the repository.
- **Tests**: one test per meaningfully distinct behavior (happy path, each
  documented error path, each documented edge case named in the relevant
  `specs/*.md` phase). Do not write a test for a branch that cannot execute
  — if you find yourself needing to force one, the production code has an
  unreachable branch that should be deleted instead.
- **Vue components** (admin UI): keep validation server-side. The UI may
  disable a submit button for empty input as a UX nicety, but it must not
  re-implement the API's valibot rules client-side as a second source of
  truth for "is this a valid URL" — surface the API's `problem+json`
  `detail` message instead.

## Before finishing any change

1. `npm run check` (types, lint, format) passes with no new suppressions.
2. `npm test` passes, and any new test corresponds to a real, documented
   behavior — not a branch invented to pad coverage.
3. Re-read the diff and ask: could any of this be deleted without a test
   failing? If yes, delete it.
