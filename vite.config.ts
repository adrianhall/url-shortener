import { cloudflareAccessPlugin } from '@adrianhall/cloudflare-toolkit/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

import { accessPolicies } from './src/worker/path-policies';

export default defineConfig({
  root: 'src/client',
  plugins: [
    cloudflareAccessPlugin({
      policies: accessPolicies,
      users: [
        { email: 'admin@cloudflare.com', name: 'Joe Admin' },
        { email: 'notadmin@cfapps.uk', name: 'Not Admin' },
      ],
    }),
    cloudflare({
      experimental: {
        newConfig: { cfBuildOutput: true },
      },
    }),
  ],
});
