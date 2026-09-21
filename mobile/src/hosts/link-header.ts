/**
 * The `Link` header, which is how nearly every forge says "there is another page".
 *
 * Same job as the desktop's `LinkHeader.cs`. Kept apart from the provider because it is
 * pure string work with no HTTP in it, which makes it the one piece of the paging story
 * that can be reasoned about on its own.
 */

/**
 * The URL for one relation, e.g. `next`, from a header like:
 *
 * `<https://api.github.com/user/repos?page=2>; rel="next", <...>; rel="last"`
 *
 * Returns `undefined` when the header is absent or names no such relation - which is how
 * the last page announces itself, so it is an ordinary answer rather than a failure.
 */
export function linkFor(header: string | null, relation: string): string | undefined {
  if (!header) return undefined;

  for (const part of splitLinks(header)) {
    const match = /^\s*<([^>]*)>\s*;\s*(.*)$/.exec(part);
    if (!match) continue;

    const [, url, attributes] = match;
    if (relationOf(attributes) === relation) return url;
  }
  return undefined;
}

export function hasNextPage(header: string | null): boolean {
  return linkFor(header, 'next') !== undefined;
}

/**
 * Splits on the commas *between* links rather than every comma, since a URL may hold one
 * inside a query value. Anything within angle brackets is left alone.
 */
function splitLinks(header: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (char === '<') depth++;
    else if (char === '>') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(header.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(header.slice(start));
  return parts;
}

function relationOf(attributes: string): string | undefined {
  for (const attribute of attributes.split(';')) {
    const match = /^\s*rel\s*=\s*"?([^";]+)"?\s*$/.exec(attribute);
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * How many items a page of this endpoint holds, read from the endpoint's own query.
 *
 * Forges disagree on the parameter's name - `limit` for Gitea, `per_page` for GitHub and
 * GitLab - and a manifest writes whichever its site takes. Knowing the number lets paging
 * stop at a short page on a site that sends no `Link` header at all, rather than fetching
 * one empty page to find out.
 */
export function pageSizeOf(endpoint: string, fallback = 30): number {
  const match = /[?&](?:limit|per_page|pageSize|page_size)=(\d+)/.exec(endpoint);
  return match ? Number(match[1]) : fallback;
}

/** Adds `page=N` to an endpoint that already carries a query, or starts one. */
export function withPage(endpoint: string, page: number): string {
  if (page <= 1) return endpoint;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}page=${page}`;
}
