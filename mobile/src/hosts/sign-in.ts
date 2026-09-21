/**
 * Getting a token, and turning it into an account.
 *
 * Everything here runs *before* a `HostProvider` exists, which is why it is a handful of
 * functions rather than methods: there is no account to hang them off yet.
 *
 * Two ways in. A personal access token the user pastes, which works on every site and is
 * the only method the desktop's manifests declare. And GitHub's device flow, where the
 * app shows a short code, the user approves it in a browser, and we poll until the site
 * says yes - described in the manifest rather than written as code, so any site that
 * copies GitHub's flow gets it for free.
 */

import { fillTemplate, readNumber, readString } from './field-ref';
import { HostError } from './provider';
import type { HostManifest } from './manifest';
import type { Account } from './types';
import { apiRoot, joinUrl } from './urls';

/**
 * How long one sign-in request may take.
 *
 * The same twenty seconds a provider allows, and for the same reason: React Native's
 * Android client is built with no timeout at all - "No timeouts by default", in its own
 * source - so an address that accepts a connection and then says nothing would leave the
 * Add button spinning for as long as the app is alive, where iOS gives up by itself after a
 * minute. Everything here runs before a `HostProvider` exists, so it cannot borrow that
 * clock and carries its own.
 */
const SIGN_IN_TIMEOUT = 20_000;

/**
 * One bounded request, body and all.
 *
 * The body is read here rather than by the caller so that the clock covers the whole
 * answer: a server that sends headers and then stalls has to be given up on too. A refusal
 * is not thrown - the device flow reads its own errors out of a non-2xx body - so callers
 * check `response` themselves.
 */
async function ask(
  url: string,
  init: RequestInit,
  describe: string,
  signal?: AbortSignal
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_IN_TIMEOUT);
  const relay = () => controller.abort();
  signal?.addEventListener('abort', relay);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, text: await response.text() };
  } catch {
    if (signal?.aborted) throw new HostError('Sign-in cancelled.');
    throw new HostError(
      controller.signal.aborted
        ? `${describe} did not answer within ${SIGN_IN_TIMEOUT / 1000} seconds.`
        : `Could not reach ${describe}. Check the address and the connection.`
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

/** Normalises what a person typed into an origin the rest of the app can rely on. */
export function normaliseBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new HostError('Enter the address of the server.');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    // Deliberately origin only. A person pastes the page they were looking at, path and
    // all, and every endpoint in a manifest is written from the root.
    return url.origin;
  } catch {
    throw new HostError(`"${input}" is not an address.`);
  }
}

/**
 * Whether the site at this URL is the kind the manifest describes.
 *
 * Probes the version endpoint rather than guessing from the domain, because a self-hosted
 * Gitea can be on any domain at all - which is the whole reason the desktop stopped
 * guessing too.
 */
export async function recognises(manifest: HostManifest, baseUrl: string): Promise<boolean> {
  const rule = manifest.recognise;
  if (!rule?.path) return false;

  try {
    const { response, text } = await ask(
      joinUrl(apiRoot(manifest, baseUrl), rule.path),
      { headers: { Accept: 'application/json' } },
      baseUrl
    );
    if (!response.ok) return false;
    const body: unknown = JSON.parse(text);
    return readString(body, rule.expectField) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Signs in with a token, by asking the site who the token belongs to.
 *
 * The call doubles as the check that the token is any good: a site that answers with a
 * user has accepted it, and one that refuses says so in a way `HostError` can explain.
 */
export async function signInWithToken(
  manifest: HostManifest,
  baseUrl: string,
  token: string
): Promise<Account> {
  const endpoint = manifest.endpoints?.currentUser;
  if (!endpoint) {
    throw new HostError(`${manifest.displayName} has no address for the signed-in user.`);
  }
  if (!token.trim()) {
    throw new HostError('Paste the token first.');
  }

  const header = manifest.authHeader;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (header) headers[header.name] = fillTemplate(header.value, { token: token.trim() });

  const url = joinUrl(apiRoot(manifest, baseUrl), endpoint);
  const { response, text } = await ask(url, { headers }, baseUrl);

  if (response.status === 401 || response.status === 403) {
    throw new HostError(
      `${manifest.displayName} rejected that token. Check it was copied whole, and that it has the read scopes.`,
      response.status
    );
  }
  if (!response.ok) {
    throw new HostError(`${manifest.displayName} answered ${response.status}.`, response.status);
  }

  const body: unknown = JSON.parse(text);
  const fields = manifest.userFields ?? {};
  const login = readString(body, fields.login ?? 'login');
  if (!login) {
    throw new HostError(
      `${baseUrl} answered, but not like ${manifest.displayName}. Is that the right kind of server?`
    );
  }

  return {
    providerId: manifest.id,
    baseUrl,
    login,
    displayName: readString(body, fields.displayName ?? 'name') || login,
    avatarUrl: readString(body, fields.avatarUrl ?? 'avatar_url'),
  };
}

/** The pending half of a browser login: what to show while waiting for approval. */
export interface DeviceLogin {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresAt: number;
}

/** Begins a browser login, returning the code to put in front of the user. */
export async function startDeviceLogin(
  manifest: HostManifest,
  baseUrl: string
): Promise<DeviceLogin> {
  const rule = manifest.deviceLogin;
  if (!rule) throw new HostError(`${manifest.displayName} has no browser sign-in.`);

  const { response, text } = await ask(
    joinUrl(baseUrl, rule.codePath),
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: rule.clientId, scope: rule.scope ?? '' }),
    },
    baseUrl
  );

  if (!response.ok) {
    throw new HostError(`${manifest.displayName} would not start a sign-in.`, response.status);
  }

  const body: unknown = JSON.parse(text);
  const deviceCode = readString(body, 'device_code');
  const userCode = readString(body, 'user_code');
  const verificationUri = readString(body, 'verification_uri');

  if (!deviceCode || !userCode || !verificationUri) {
    throw new HostError(`${manifest.displayName} answered without a code.`);
  }

  const seconds = readNumber(body, 'expires_in') ?? 900;
  return {
    deviceCode,
    userCode,
    verificationUri,
    intervalSeconds: readNumber(body, 'interval') ?? 5,
    expiresAt: Date.now() + seconds * 1000,
  };
}

/**
 * Waits for the user to approve a browser login, then returns the account.
 *
 * `authorization_pending` is the normal answer for most of this loop rather than an
 * error, and `slow_down` is the site asking to be asked less often - obeying it is what
 * keeps the flow from being throttled outright.
 */
export async function completeDeviceLogin(
  manifest: HostManifest,
  baseUrl: string,
  login: DeviceLogin,
  signal?: AbortSignal
): Promise<{ account: Account; token: string }> {
  const rule = manifest.deviceLogin;
  if (!rule) throw new HostError(`${manifest.displayName} has no browser sign-in.`);

  let interval = login.intervalSeconds;

  while (Date.now() < login.expiresAt) {
    if (signal?.aborted) throw new HostError('Sign-in cancelled.');
    await delay(interval * 1000);
    if (signal?.aborted) throw new HostError('Sign-in cancelled.');

    const { text } = await ask(
      joinUrl(baseUrl, rule.tokenPath),
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: rule.clientId,
          device_code: login.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      },
      baseUrl,
      signal
    );

    const body: unknown = JSON.parse(text);
    const token = readString(body, 'access_token');
    if (token) {
      const account = await signInWithToken(manifest, baseUrl, token);
      return { account, token };
    }

    const error = readString(body, 'error');
    if (error === 'authorization_pending') continue;
    if (error === 'slow_down') {
      interval = readNumber(body, 'interval') ?? interval + 5;
      continue;
    }
    if (error === 'expired_token') throw new HostError('The code expired. Start again.');
    if (error === 'access_denied') throw new HostError('Sign-in was declined.');
    if (error) throw new HostError(readString(body, 'error_description') ?? error);
  }

  throw new HostError('The code expired. Start again.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
