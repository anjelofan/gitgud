import { describe, expect, it } from 'vitest';

import { GithubApiError } from '$lib/server/github/client';

import { withRetries } from './retry.server';

function githubError(status: number) {
    return new GithubApiError(status, 'https://api.github.com/fake', 'fake body');
}

/** Fails the first N attempts with the given statuses, then resolves. */
function flaky<T>(failureStatuses: number[], value: T) {
    let attempts = 0;
    return {
        run() {
            attempts += 1;
            const status = failureStatuses[attempts - 1];
            if (typeof status === 'number') throw githubError(status);
            return Promise.resolve(value);
        },
        attempts() {
            return attempts;
        },
    };
}

function noDelay() {
    return Promise.resolve();
}

describe('withRetries', () => {
    it('returns the value without retrying when the first attempt succeeds', async () => {
        const target = flaky([], 'ok');
        const result = await withRetries(target.run, {
            attempts: 5,
            baseDelayMs: 250,
            delay: noDelay,
        });
        expect(result).toBe('ok');
        expect(target.attempts()).toBe(1);
    });

    it('retries until a not-ready repository read succeeds', async () => {
        const target = flaky([409, 409], 'ok');
        const retried: number[] = [];
        const result = await withRetries(target.run, {
            attempts: 5,
            baseDelayMs: 250,
            delay: noDelay,
            onRetry: (error, attempt) => retried.push(attempt),
        });
        expect(result).toBe('ok');
        expect(target.attempts()).toBe(3);
        expect(retried).toEqual([1, 2]);
    });

    it('retries 404 ref-not-found as well', async () => {
        const target = flaky([404], 'ok');
        const result = await withRetries(target.run, {
            attempts: 3,
            baseDelayMs: 250,
            delay: noDelay,
        });
        expect(result).toBe('ok');
        expect(target.attempts()).toBe(2);
    });

    it('rethrows after exhausting the attempts', async () => {
        const target = flaky([409, 409, 409], 'ok');
        await expect(
            withRetries(target.run, { attempts: 3, baseDelayMs: 250, delay: noDelay }),
        ).rejects.toThrow(/409/u);
        expect(target.attempts()).toBe(3);
    });

    it('does not retry non-retryable statuses', async () => {
        const target = flaky([500], 'ok');
        await expect(
            withRetries(target.run, { attempts: 5, baseDelayMs: 250, delay: noDelay }),
        ).rejects.toThrow(/500/u);
        expect(target.attempts()).toBe(1);
    });

    it('backs off exponentially between attempts', async () => {
        const target = flaky([409, 409], 'ok');
        const delays: number[] = [];
        await withRetries(target.run, {
            attempts: 5,
            baseDelayMs: 100,
            delay(ms) {
                delays.push(ms);
                return Promise.resolve();
            },
        });
        expect(delays).toEqual([100, 200]);
    });
});
