import { spawnSync } from 'node:child_process';

/**
 * Executes a `cf` CLI command and optionally returns its normalized JSON payload.
 *
 * @param {string[]} args Command arguments following `cf`.
 * @param {{ parse?: boolean }} [options] Command execution options.
 * @returns {unknown | undefined} The `result` or `data` field from JSON output,
 * or `undefined` when parsing is disabled.
 * @throws {Error} If `cf` cannot start or does not return valid JSON.
 */
export function cloudflare(args, { parse = true } = {}) {
  const result = spawnSync('cf', args, {
    encoding: 'utf8',
    env: process.env,
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!parse) return undefined;

  try {
    const response = JSON.parse(result.stdout);
    return response?.result ?? response?.data ?? response;
  } catch {
    throw new Error(`cf returned invalid JSON:\n${result.stdout}`);
  }
}
