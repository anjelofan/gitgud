import { GithubApiError } from '$lib/server/github/client';

/**
 * GitHub reports a not-yet-materialized repository (the template-generate
 * endpoint creates it asynchronously) with these statuses on the first
 * content-dependent read.
 */
const RETRYABLE_STATUSES = new Set([404, 409]);

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

export interface RetryOptions {
    attempts: number;
    baseDelayMs: number;
    /** Injectable delay for tests; defaults to a real timer. */
    delay?: (ms: number) => Promise<void>;
    onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Runs `fn`, retrying on GitHub statuses that indicate the repository is not
 * ready yet (`404`/`409`), with exponential backoff (`baseDelayMs * 2^attempt`).
 * Any other error — including exhausted attempts — rethrows unchanged.
 */
export async function withRetries<T>(fn: () => Promise<T>, options: RetryOptions) {
    const { attempts, baseDelayMs, delay = sleep, onRetry } = options;

    let attempt = 1;
    while (true)
        try {
            return await fn();
        } catch (error) {
            const retryable =
                error instanceof GithubApiError && RETRYABLE_STATUSES.has(error.status);
            if (!retryable || attempt >= attempts) throw error;

            onRetry?.(error, attempt);
            await delay(baseDelayMs * 2 ** (attempt - 1));
            attempt += 1;
        }
}
