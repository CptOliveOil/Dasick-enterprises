import 'server-only';

/**
 * The one way a provider adapter talks to the outside world.
 *
 * Every real adapter goes through this, for three reasons that are all about
 * failure rather than success:
 *
 * 1. **Secrets must never appear in an error.** Provider errors get written to
 *    `task.error`, shown on screen, and logged. A stack trace or a response
 *    body that echoes the Authorization header would put an API key into the
 *    database and onto the operator's screen. `redact()` runs over every
 *    message before it leaves this file, and `tests/providers.test.ts` asserts
 *    a key never survives an error path.
 *
 * 2. **Failures need categories, not just messages.** A 401 needs a new key, a
 *    429 needs waiting, a 400 needs a different prompt, and a socket hang-up
 *    needs a retry. Collapsing those into "request failed" makes every one of
 *    them look like the same shrug.
 *
 * 3. **Retries belong in one place.** Transient failures are retried with
 *    backoff; a 400 never is, because sending the same bad request again is
 *    just paying twice for the same refusal.
 */

export type ProviderFailure =
  | 'auth'
  | 'rate_limit'
  | 'quota'
  | 'moderation'
  | 'bad_request'
  | 'server'
  | 'network'
  | 'timeout';

export class ProviderRequestError extends Error {
  constructor(
    readonly failure: ProviderFailure,
    readonly status: number | null,
    message: string,
    /** True when trying the identical request again could succeed. */
    readonly retryable: boolean,
  ) {
    super(redact(message));
    this.name = 'ProviderRequestError';
  }

  /** What the operator should actually do about it. */
  get remedy(): string {
    switch (this.failure) {
      case 'auth':
        return 'The key was rejected. Check it is correct, active and has the right permissions.';
      case 'rate_limit':
        return 'The provider is rate limiting. The step can be retried in a few minutes.';
      case 'quota':
        return 'The account is out of credit or quota. Top it up, then retry this step.';
      case 'moderation':
        return 'The provider refused the content. Edit the prompt or the script and retry.';
      case 'bad_request':
        return 'The provider rejected the request itself. This is a bug rather than a setting.';
      case 'timeout':
      case 'network':
        return 'The provider could not be reached. Retry the step.';
      case 'server':
        return 'The provider had an internal error. Retry the step shortly.';
    }
  }
}

/**
 * Removes anything key-shaped from a message.
 *
 * Deliberately blunt. A missed redaction writes a secret to the database; an
 * over-eager one costs a few characters of a message nobody reads twice.
 */
export function redact(text: string): string {
  return text
    .replace(/\b(sk|xi|pk|rt|ya29|AIza|ghp)[-_][A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]')
    .replace(/("?(?:api[-_]?key|authorization|access_token|refresh_token|client_secret)"?\s*[:=]\s*)"?[^",\s}]+/gi,
      '$1[redacted]');
}

function categorise(status: number, body: string): { failure: ProviderFailure; retryable: boolean } {
  if (status === 401 || status === 403) return { failure: 'auth', retryable: false };
  if (status === 429) return { failure: 'rate_limit', retryable: true };
  if (status === 402) return { failure: 'quota', retryable: false };
  if (status === 400 && /moderat|safety|policy|content_filter|nsfw/i.test(body)) {
    return { failure: 'moderation', retryable: false };
  }
  if (status >= 400 && status < 500) return { failure: 'bad_request', retryable: false };
  return { failure: 'server', retryable: true };
}

export interface ProviderFetchOptions extends RequestInit {
  /** Milliseconds. Generation calls are slow, so this is generous by default. */
  timeoutMs?: number;
  /** Attempts for retryable failures, including the first. */
  attempts?: number;
  /** For the error message. Never include a key in it. */
  label: string;
}

const BACKOFF_MS = [1_000, 4_000, 10_000];

/**
 * A single provider request, with categorised errors and bounded retries.
 *
 * Returns the raw `Response` so callers can read JSON or bytes as they need.
 * Non-2xx responses throw rather than returning, because a provider adapter
 * that returns a failed response as if it were media is how a placeholder ends
 * up in a production video.
 */
export async function providerFetch(
  url: string,
  options: ProviderFetchOptions,
): Promise<Response> {
  const { timeoutMs = 120_000, attempts = 3, label, ...init } = options;
  let last: ProviderRequestError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;

      // Bounded: a provider that returns a megabyte of HTML on error should not
      // put a megabyte of HTML into `task.error`.
      const body = (await response.text().catch(() => '')).slice(0, 600);
      const { failure, retryable } = categorise(response.status, body);
      last = new ProviderRequestError(
        failure,
        response.status,
        `${label} failed (${response.status}): ${body || response.statusText}`,
        retryable,
      );
      if (!retryable) throw last;
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        if (!error.retryable) throw error;
        last = error;
      } else {
        const aborted = error instanceof Error && error.name === 'AbortError';
        last = new ProviderRequestError(
          aborted ? 'timeout' : 'network',
          null,
          `${label} ${aborted ? `timed out after ${timeoutMs}ms` : 'could not reach the provider'}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true,
        );
      }
    } finally {
      clearTimeout(timer);
    }

    const wait = BACKOFF_MS[attempt];
    if (attempt < attempts - 1 && wait) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw last ?? new ProviderRequestError('network', null, 'The provider request failed.', true);
}

export async function providerJson<T>(url: string, options: ProviderFetchOptions): Promise<T> {
  const response = await providerFetch(url, options);
  return (await response.json()) as T;
}

export async function providerBytes(
  url: string,
  options: ProviderFetchOptions,
): Promise<Buffer> {
  const response = await providerFetch(url, options);
  return Buffer.from(await response.arrayBuffer());
}

/** Present and non-blank. Used to decide whether an adapter is configured. */
export function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
