/**
 * Access resources are not yet supported by defineWorker, so deploy.mjs
 * reconciles this declaration with the cf CLI after deploying the Worker.
 */
export const access = Object.freeze({
  hostname: process.env.APP_HOSTNAME?.trim(),
  applicationName: 'Briefly public links',
  policyName: 'Bypass everyone',
  adminAllowedEmailDomain: process.env.ACCESS_ALLOWED_EMAIL_DOMAIN?.trim(),
  sessionDuration: '24h',
});
