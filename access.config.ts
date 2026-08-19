import { defineAccessConfig } from '@adrianhall/cloudflare-toolkit';

const hostname = process.env.APP_HOSTNAME?.trim();

if (hostname === undefined || hostname === '') {
  throw new Error('APP_HOSTNAME is required.');
}

export default defineAccessConfig({
  policies: [
    {
      name: 'Briefly bypass everyone',
      decision: 'bypass',
      include: [{ everyone: {} }],
    },
  ],
  applications: [
    {
      name: 'Briefly public links',
      domain: hostname,
      sessionDuration: '24h',
      policies: [{ name: 'Briefly bypass everyone', precedence: 1 }],
    },
  ],
});
