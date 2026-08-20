/**
 * @file utility library
 */

/**
 * Returns the value of an environment variable, but returns
 * 'undefined' if the value is set to a blank string.
 * @param name the name of the environment variable
 * @returns the value of the environment variable
 */
function getEnvironmentVariable(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') {
    return undefined;
  }
  return value;
}

/**
 * The current environment
 */
export const environment = getEnvironmentVariable('ENVIRONMENT') ?? 'production';

/**
 * Checks for development environment
 */
export const isDevelopment = (): boolean => environment === 'development';
