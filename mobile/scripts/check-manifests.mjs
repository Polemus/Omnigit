/**
 * Fails if a host manifest has drifted from the desktop's copy.
 *
 * The two apps read the same format, and the whole promise of that is a site described
 * once. Copies rot quietly though: someone fixes GitLab's merge-request ref on the
 * desktop, the phone keeps the old one, and the bug shows up months later as "checkout
 * works on my laptop".
 *
 * So the rule is one-directional and narrow: every key the desktop's manifest defines
 * must be present here and identical. Keys the phone adds on top are ignored - it needs
 * addresses a clone never asks for, and requiring the desktop to carry them would make
 * the check the reason the format grows.
 *
 * Run with `npm run check:manifests`. Nothing here imports from the app, so it works
 * before an install and inside CI.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, '..', '..', 'src', 'Omnigit', 'HostProviders', 'Manifests');
const mobileDir = resolve(here, '..', 'src', 'hosts', 'manifests');

/** Comment keys carry no behaviour and the two apps annotate for different readers. */
const isComment = (key) => key.startsWith('//');

function load(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Every difference, as a list of paths, rather than the first one.
 *
 * A drifted manifest usually drifted in several places at once - one endpoint moved and
 * its field map with it - and reporting one per run turns a five-minute fix into five.
 */
function compare(desktop, mobile, path, problems) {
  if (Array.isArray(desktop)) {
    if (!Array.isArray(mobile) || desktop.length !== mobile.length) {
      problems.push(`${path}: desktop has ${JSON.stringify(desktop)}, mobile has ${JSON.stringify(mobile)}`);
      return;
    }
    desktop.forEach((entry, i) => compare(entry, mobile[i], `${path}[${i}]`, problems));
    return;
  }

  if (desktop !== null && typeof desktop === 'object') {
    if (mobile === null || typeof mobile !== 'object' || Array.isArray(mobile)) {
      problems.push(`${path}: mobile is not an object`);
      return;
    }
    for (const [key, value] of Object.entries(desktop)) {
      if (isComment(key)) continue;
      if (!(key in mobile)) {
        problems.push(`${path}.${key}: missing from mobile`);
        continue;
      }
      compare(value, mobile[key], `${path}.${key}`, problems);
    }
    return;
  }

  if (desktop !== mobile) {
    problems.push(`${path}: desktop has ${JSON.stringify(desktop)}, mobile has ${JSON.stringify(mobile)}`);
  }
}

function main() {
  if (!existsSync(desktopDir)) {
    // Checked out on its own, or built from a source archive that carries only mobile/.
    // Not an error: there is nothing to drift from.
    console.log(`No desktop manifests at ${desktopDir} - nothing to compare.`);
    return 0;
  }

  const desktopFiles = readdirSync(desktopDir).filter((name) => name.endsWith('.json'));
  let failed = false;

  for (const name of desktopFiles) {
    const mobilePath = join(mobileDir, name);
    if (!existsSync(mobilePath)) {
      console.error(`FAIL ${name}: the desktop ships this host and mobile does not.`);
      failed = true;
      continue;
    }

    const problems = [];
    compare(load(join(desktopDir, name)), load(mobilePath), name.replace('.json', ''), problems);

    if (problems.length === 0) {
      console.log(`ok   ${name}`);
    } else {
      failed = true;
      console.error(`FAIL ${name}`);
      for (const problem of problems) console.error(`       ${problem}`);
    }
  }

  if (failed) {
    console.error('\nA manifest has drifted. Copy the desktop value across, or change both.');
    return 1;
  }
  console.log(`\n${desktopFiles.length} manifest(s) match the desktop.`);
  return 0;
}

process.exit(main());
