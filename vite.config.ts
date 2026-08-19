import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  plugins: [
    cloudflare({
      experimental: {
        newConfig: { cfBuildOutput: true },
      },
    }),
  ],
});
