/**
 * Pull one file's patch out of a complete multi-file unified diff.
 *
 * Raw diff endpoints all use the standard `diff --git` section boundary even though the
 * endpoint addresses differ. Matching the ---/+++ headers also handles added, removed,
 * and renamed files without guessing from the section title.
 */

export function filePatchFromPullRequestDiff(
  fullDiff: string,
  requestedPath: string
): string | undefined {
  const lines = fullDiff.replace(/\r\n/g, '\n').split('\n');
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (line.startsWith('diff --git ')) starts.push(index);
  });

  if (starts.length === 0) starts.push(0);

  for (let sectionIndex = 0; sectionIndex < starts.length; sectionIndex += 1) {
    const start = starts[sectionIndex];
    const end = starts[sectionIndex + 1] ?? lines.length;
    const section = lines.slice(start, end);

    const names = section
      .filter((line) => line.startsWith('--- ') || line.startsWith('+++ '))
      .map(readHeaderPath)
      .filter((path): path is string => path !== undefined);

    if (!names.includes(requestedPath)) continue;

    const firstHunk = section.findIndex((line) => line.startsWith('@@ '));
    if (firstHunk < 0) return undefined;

    return section.slice(firstHunk).join('\n').trimEnd();
  }

  return undefined;
}

/**
 * Every file's patch in a multi-file unified diff, keyed by path.
 *
 * The same sections and headers `filePatchFromPullRequestDiff` reads, in one pass: for
 * filling in a whole commit's files at once, where asking for each file in turn would
 * read a large commit's diff once per file. A renamed file is found under both of its
 * names, and a file with no hunk - a binary, a change of mode - is simply absent.
 *
 * Only the lines before a section's first hunk are read as headers. Inside a hunk, a
 * removed line that happens to begin `-- ` reads `--- …`, and that is content.
 */
export function patchesByPath(fullDiff: string): Map<string, string> {
  const lines = fullDiff.replace(/\r\n/g, '\n').split('\n');
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (line.startsWith('diff --git ')) starts.push(index);
  });

  if (starts.length === 0) starts.push(0);

  const patches = new Map<string, string>();

  starts.forEach((start, sectionIndex) => {
    const section = lines.slice(start, starts[sectionIndex + 1] ?? lines.length);
    const firstHunk = section.findIndex((line) => line.startsWith('@@ '));
    if (firstHunk < 0) return;

    const patch = section.slice(firstHunk).join('\n').trimEnd();
    for (const line of section.slice(0, firstHunk)) {
      if (!line.startsWith('--- ') && !line.startsWith('+++ ')) continue;
      const path = readHeaderPath(line);
      if (path !== undefined && !patches.has(path)) patches.set(path, patch);
    }
  });

  return patches;
}

/**
 * How many lines a patch adds and removes, for a file that arrived without the counts -
 * GitLab never sends them, and Gitea's commit files arrive with neither counts nor patch.
 *
 * Only lines inside a hunk count. A patch cut from a whole diff can still carry its
 * `---`/`+++` file headers, and those are not changes - where an added line that happens
 * to begin `++` is.
 */
export function lineCounts(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;

  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true;
    } else if (inHunk && line.startsWith('+')) {
      additions += 1;
    } else if (inHunk && line.startsWith('-')) {
      deletions += 1;
    }
  }

  return { additions, deletions };
}

function readHeaderPath(line: string): string | undefined {
  let value = line.slice(4);
  const tab = value.indexOf('\t');
  if (tab >= 0) value = value.slice(0, tab);
  if (value === '/dev/null') return undefined;

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value) as string;
    } catch {
      // Git can quote unusual byte sequences with octal escapes, which JSON does not
      // understand. Keeping the quoted value simply makes this section a non-match.
    }
  }

  return value.startsWith('a/') || value.startsWith('b/') ? value.slice(2) : value;
}
