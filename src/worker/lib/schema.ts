/**
 * @file Valibot schemas
 */
import { pipe, string, regex, type InferOutput } from 'valibot';

/**
 * The valibot schema for an 8-digit base-62 value, which is
 * used as the link-id
 */
export const linkIdSchema = pipe(
  string(),
  regex(/^[0-9A-Za-z]{8}$/u, 'Link ID must be 8 base62 characters.'),
);

/**
 * A typed version of the `linkIdSchema`
 */
export type LinkId = InferOutput<typeof linkIdSchema>;
