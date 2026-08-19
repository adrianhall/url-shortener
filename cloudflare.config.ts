import { bindings, defineWorker } from '@cloudflare/vite-plugin/experimental-config';
import { fileURLToPath } from 'node:url';

const hostname = process.env.APP_HOSTNAME?.trim();

export default defineWorker({
  name: 'url-shortener',
  entrypoint: fileURLToPath(new URL('./src/worker/index.ts', import.meta.url)),
  compatibilityDate: '2026-08-18',
  compatibilityFlags: ['nodejs_compat'],
  env: {
    LINKS: bindings.kv(),
  },
  assets: {
    notFoundHandling: 'single-page-application',
    runWorkerFirst: ['/l/*', '/api/*'],
  },
  observability: {
    enabled: true,
    headSamplingRate: 1,
  },
  domains: hostname ? [hostname] : [],
  workersDev: false,
  previewUrls: false,
});
