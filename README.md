# Briefly URL shortener

Phase 1 of a Cloudflare Worker URL shortener. Vite builds the public landing
page, while Hono handles short-link redirects at `/l/:linkId`.

## Project structure

The application is one integrated Vite and Cloudflare Worker deployment, with
separate client and Worker boundaries that can grow independently:

```text
src/
  client/                  # Browser entry point, UI, and browser-only styles
  worker/                  # Hono composition root, routes, services, and bindings
tests/
  client/                  # jsdom tests for browser behavior
  worker/                  # Tests in the Cloudflare Workers runtime
```

`cloudflare.config.ts` remains at the repository root because it describes the
deployment as a whole. `tsconfig.client.json` and `tsconfig.worker.json` keep
browser and Worker globals from leaking across the boundary. Vitest runs both
test projects through the root `npm test` command; the Worker project runs in
Miniflare with a local `LINKS` KV binding.

When the client needs Vue or React, replace only `src/client/` and add its Vite
plugin. The Worker, deployment configuration, and Worker tests remain intact.

## Routes

- `/` serves the Vite static landing page and its CSS and JavaScript assets.
- `/l/:linkId` reads the eight-character base62 ID from the `LINKS` KV binding.
  A stored destination receives a `302` redirect; missing or malformed IDs
  receive `404 Not Found`.
- `/api/*` is reserved for the future admin API.

## Local development

Requirements: Node.js 22+ and npm 10.

```sh
npm install
npm run dev
```

The Vite plugin creates a local `LINKS` KV namespace at `.wrangler/state`.
Seed its running Miniflare instance with the `cf` CLI, then visit the link:

```sh
npx cf --local --local-endpoint http://localhost:5173 kv keys update 8Gk2pZqM --namespace-id LINKS --body https://example.com
open http://localhost:5173/l/8Gk2pZqM
```

The local endpoint is required until `cf` supports automatic discovery of a
running development session.

## Validation

```sh
npm run check
npm test
npm run test:client
npm run test:worker
npm run build
```

## Deployment

Copy `.env.example` to `.env` and replace `CLOUDFLARE_ACCOUNT_ID`. The deploy
script loads it without replacing values already exported by your shell or CI.
`APP_HOSTNAME` is the Worker custom domain; `workers.dev` and preview URLs are
disabled so it is the only public hostname.

`LINKS` deliberately omits a namespace ID. `cf deploy` automatically creates
and binds the KV namespace.

```sh
npm run deploy
```

`access.config.ts` declares reusable Access policies and self-hosted
applications through `@adrianhall/cloudflare-toolkit`. `cf-access-policy`
defaults to that file; pass `--config <file>` to use a different declaration.
`apply` prints its plan and asks for confirmation; `--yes` is suitable for CI.
The current declaration creates a hostname-wide `Bypass everyone` policy.
Future path-scoped administration applications can reuse an Allow policy for
`ACCESS_ALLOWED_EMAIL_DOMAIN`.

The public client is framework-free for now. An admin interface can be added
later as Vue or React in `src/client`, with its routes handled by the reserved
`/api/*` Worker path.
