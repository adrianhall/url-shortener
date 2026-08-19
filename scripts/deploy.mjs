import { loadEnvFile } from 'node:process';
import { cloudflare } from './lib/cloudflare.mjs';

try {
  loadEnvFile();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const { access } = await import('../access.config.mjs');

function required(value, name) {
  if (!value) throw new Error(`${name} is required. Set it in .env or export it.`);
  return value;
}

function asResources(value) {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (value && typeof value === 'object' && Array.isArray(value.items)) return value.items;
  return [];
}

function resourceId(resource, kind) {
  const id = resource?.id ?? resource?.uid;
  if (typeof id !== 'string') throw new Error(`cf did not return an ID for the ${kind}.`);
  return id;
}

function createOrUpdateAccessApplication(hostname) {
  const applicationBody = {
    name: access.applicationName,
    domain: hostname,
    type: 'self_hosted',
    session_duration: access.sessionDuration,
  };
  const applications = asResources(
    cloudflare(['zero-trust', 'access', 'applications', 'list', '--domain', hostname, '--exact']),
  ).filter((application) => application.domain === hostname);

  if (applications.length > 1) {
    throw new Error(`More than one Access application exists for ${hostname}.`);
  }

  if (applications.length === 0) {
    return cloudflare([
      'zero-trust',
      'access',
      'applications',
      'create',
      '--body',
      JSON.stringify(applicationBody),
    ]);
  }

  return cloudflare([
    'zero-trust',
    'access',
    'applications',
    'update',
    resourceId(applications[0], 'Access application'),
    '--body',
    JSON.stringify(applicationBody),
  ]);
}

function createOrUpdateAccessPolicy(applicationId) {
  const policyBody = {
    name: access.policyName,
    decision: 'bypass',
    precedence: 1,
    include: [{ everyone: {} }],
  };
  const policies = asResources(
    cloudflare(['zero-trust', 'access', 'applications', 'policies', 'list', '--app-id', applicationId]),
  ).filter((policy) => policy.name === access.policyName);

  if (policies.length > 1) {
    throw new Error(`More than one Access policy is named ${access.policyName}.`);
  }

  if (policies.length === 0) {
    cloudflare([
      'zero-trust',
      'access',
      'applications',
      'policies',
      'create',
      applicationId,
      '--body',
      JSON.stringify(policyBody),
    ]);
    return;
  }

  cloudflare([
    'zero-trust',
    'access',
    'applications',
    'policies',
    'update',
    resourceId(policies[0], 'Access policy'),
    '--app-id',
    applicationId,
    '--body',
    JSON.stringify(policyBody),
  ]);
}

const hostname = required(access.hostname, 'APP_HOSTNAME');
required(process.env.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID');

// Deploy first so the configured custom domain exists before the Access app is reconciled.
cloudflare(['deploy'], { parse: false });

const application = createOrUpdateAccessApplication(hostname);
const applicationId = resourceId(application, 'Access application');
createOrUpdateAccessPolicy(applicationId);
