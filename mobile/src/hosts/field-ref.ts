/**
 * Reading values out of a site's JSON by the dotted paths a manifest names.
 *
 * The whole point of the manifest format is that nothing here knows what a forge is
 * called. These functions see a path and a blob of JSON and nothing else.
 */

import type { FieldRef } from './manifest';

/** Anything the JSON parser can hand back. */
type Json = unknown;

/**
 * Walks a dotted path: `"owner.login"`, `"head.ref"`, `"namespace.full_path"`.
 *
 * Returns `undefined` for any missing link rather than throwing, because a field a
 * manifest names optimistically - an avatar, a description - is legitimately absent on
 * plenty of real responses, and one missing avatar should not empty a repository list.
 */
export function resolvePath(source: Json, path: string): Json {
  if (!path) return undefined;
  let current = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, Json>)[segment];
  }
  return current;
}

/** The raw value a `FieldRef` points at, before any coercion. */
function rawValue(source: Json, ref: FieldRef | undefined): Json {
  if (ref === undefined) return undefined;
  const path = typeof ref === 'string' ? ref : ref.path;
  return resolvePath(source, path);
}

export function readString(source: Json, ref: FieldRef | undefined): string | undefined {
  const value = rawValue(source, ref);
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/** Same, but never `undefined` - for the fields a screen cannot render without. */
export function readStringOr(source: Json, ref: FieldRef | undefined, fallback: string): string {
  return readString(source, ref) ?? fallback;
}

export function readNumber(source: Json, ref: FieldRef | undefined): number | undefined {
  const value = rawValue(source, ref);
  if (typeof value === 'number') return value;
  // Some sites send counts as strings; a number that arrived as text is still a number.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

/**
 * A boolean, in any of the three ways a forge spells one.
 *
 * A plain `true`. A string the manifest says to compare - GitLab's
 * `{ path: "visibility", equals: "private" }`. Or the mere presence of an object, which
 * is how GitHub marks an issue as being a pull request.
 */
export function readBoolean(source: Json, ref: FieldRef | undefined): boolean {
  if (ref === undefined) return false;
  const value = rawValue(source, ref);
  if (typeof ref !== 'string') {
    return typeof value === 'string' && value === ref.equals;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return false;
}

/** True when the path resolves to anything at all - GitHub's `pull_request` marker. */
export function hasValue(source: Json, path: string | undefined): boolean {
  if (!path) return false;
  const value = resolvePath(source, path);
  return value !== null && value !== undefined;
}

/**
 * An array of objects at a path, for the fields that are lists - labels, mostly.
 *
 * Returns an empty array rather than `undefined` so callers can map without checking;
 * "this issue has no labels" and "this site does not describe labels" look the same to a
 * screen, and both should render nothing.
 */
export function readArray(source: Json, ref: FieldRef | undefined): Json[] {
  const value = rawValue(source, ref);
  return Array.isArray(value) ? value : [];
}

/**
 * Fills `{name}` placeholders in a template.
 *
 * Values are inserted as given, *not* URL-encoded: a manifest that needs encoding says so
 * itself, the way GitLab's `{owner}%2F{repo}` does. Encoding here would double-encode
 * that and break the one site the escape hatch exists for.
 */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
