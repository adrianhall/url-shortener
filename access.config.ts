import { defineAccessConfig } from '@adrianhall/cloudflare-toolkit';

/**
 * Retrieves a trimmed version of an environment variable, throwing
 * if the environment variable does not exist.
 * @param varName - the name of the variable
 * @returns the value of the variable
 * @throws Error if the variable is not set.
 */
function getVarOrThrow(varName: string): string {
  const value = process.env[varName]?.trim();
  if (value === undefined || value === '') {
    throw new Error(`${varName} is required.  Set the value in '.env' or the environment.`);
  }
  return value;
}

const hostname = getVarOrThrow('APP_HOSTNAME');
const allowedAdminDomain = getVarOrThrow('ACCESS_ALLOWED_EMAIL_DOMAIN');
const sessionDuration = '24h';
const anonymousPolicyName = 'link - everyone';
const adminPolicyName = 'link - administrators';

export default defineAccessConfig({
  policies: [
    {
      name: anonymousPolicyName,
      decision: 'bypass',
      include: [{ everyone: {} }],
    },
    {
      name: adminPolicyName,
      decision: 'allow',
      include: [{ emailDomains: [allowedAdminDomain] }],
    },
  ],
  applications: [
    {
      name: 'link - public links',
      domain: hostname,
      sessionDuration,
      policies: [{ name: anonymousPolicyName, precedence: 1 }],
    },
    {
      name: 'link - admin access',
      domain: hostname,
      destinations: [
        { type: 'public', uri: `${hostname}/admin` },
        { type: 'public', uri: `${hostname}/admin/*` },
        // Note: /api/version is NOT special-cased here deliberately
        // See src/worker/path-policies.ts for the reasoning.
        { type: 'public', uri: `${hostname}/api/*` },
      ],
      sessionDuration,
      policies: [{ name: adminPolicyName, precedence: 1 }],
    },
  ],
});
