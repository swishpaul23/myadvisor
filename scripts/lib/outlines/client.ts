// Polite HTTP client for the Course Outlines API: one request per interval, retries on
// 429/5xx/network errors with backoff, no retry on 404, and an abort after too many
// consecutive failures. fetch and sleep are injected so tests need no network.

export type FetchFn = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type ClientOptions = {
  userAgent: string;
  intervalMs: number;
  maxRetries?: number;
  maxConsecutiveFailures?: number;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type GetResult =
  | { status: "ok"; json: unknown }
  | { status: "not-found" }
  | { status: "failed"; reason: string };

export class TooManyFailuresError extends Error {}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createClient(options: ClientOptions) {
  const maxRetries = options.maxRetries ?? 3;
  const maxConsecutiveFailures = options.maxConsecutiveFailures ?? 10;
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchFn);
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;

  let lastRequestAt = -Infinity;
  let consecutiveFailures = 0;
  const stats = { requests: 0, failures: 0 };

  async function throttledFetch(url: string) {
    const wait = lastRequestAt + options.intervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = now();
    stats.requests++;
    return fetchFn(url, {
      headers: { "User-Agent": options.userAgent, Accept: "application/json" },
    });
  }

  async function getText(
    url: string,
  ): Promise<{ status: number; body: string } | string> {
    let lastReason = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Backoff: 2s, 4s, 8s, or the server's Retry-After if longer.
        await sleep(2000 * 2 ** (attempt - 1));
      }
      try {
        const res = await throttledFetch(url);
        if (res.status === 429 || res.status >= 500) {
          lastReason = `HTTP ${res.status}`;
          const retryAfter = Number(res.headers.get("retry-after"));
          if (Number.isFinite(retryAfter) && retryAfter > 0)
            await sleep(retryAfter * 1000);
          continue;
        }
        return { status: res.status, body: await res.text() };
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
      }
    }
    return lastReason;
  }

  function recordFailure(reason: string): GetResult {
    stats.failures++;
    consecutiveFailures++;
    if (consecutiveFailures >= maxConsecutiveFailures) {
      throw new TooManyFailuresError(
        `Aborting: ${consecutiveFailures} consecutive failed requests (last: ${reason})`,
      );
    }
    return { status: "failed", reason };
  }

  async function getJson(url: string): Promise<GetResult> {
    const result = await getText(url);
    if (typeof result === "string") return recordFailure(result);
    if (result.status === 404) {
      consecutiveFailures = 0;
      return { status: "not-found" };
    }
    if (result.status !== 200) return recordFailure(`HTTP ${result.status}`);
    try {
      const json: unknown = JSON.parse(result.body);
      consecutiveFailures = 0;
      return { status: "ok", json };
    } catch {
      return recordFailure("response was not JSON");
    }
  }

  async function getRaw(url: string): Promise<string> {
    const result = await getText(url);
    if (typeof result === "string" || result.status !== 200) {
      throw new Error(
        `Could not fetch ${url}: ${typeof result === "string" ? result : `HTTP ${result.status}`}`,
      );
    }
    return result.body;
  }

  return { getJson, getRaw, stats };
}
