import * as v from 'valibot';
import { SpanStatusCode } from '@opentelemetry/api';

import { env } from '$env/dynamic/private';

import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'github.client';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_OAUTH_BASE = 'https://github.com';

/** API base for REST calls; OAuth endpoints follow the same override so the fake GitHub server intercepts everything. */
export const apiBase = env.GITHUB_API_BASE ?? DEFAULT_API_BASE;
export const oauthBase = env.GITHUB_API_BASE ?? DEFAULT_OAUTH_BASE;

const MAX_ERROR_BODY_LENGTH = 512;

export class GithubApiError extends Error {
    readonly status: number;

    constructor(status: number, url: string, bodySnippet: string) {
        super(`GitHub API request to ${url} failed with status ${status}: ${bodySnippet}`);
        this.name = 'GithubApiError';
        this.status = status;
    }
}

interface RequestJsonOptions {
    method?: string;
    token?: string;
    body?: unknown;
}

async function requestJson<T>(
    base: string,
    path: string,
    schema: v.GenericSchema<unknown, T>,
    { method = 'GET', token, body }: RequestJsonOptions = {},
) {
    return await tracer.asyncSpan('github-request', async (span) => {
        const url = new URL(path, base);
        span.setAttributes({
            'github.request.method': method,
            'github.request.url': url.toString(),
        });

        const headers: Record<string, string> = { Accept: 'application/json' };
        if (typeof token !== 'undefined') headers.Authorization = `Bearer ${token}`;
        if (typeof body !== 'undefined') headers['Content-Type'] = 'application/json';

        const response = await fetch(url, {
            method,
            headers,
            ...(typeof body === 'undefined' ? {} : { body: JSON.stringify(body) }),
        });
        span.setAttribute('github.response.status_code', response.status);

        if (!response.ok) {
            const snippet = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
            logger.error('github api request failed', void 0, {
                'github.request.url': url.toString(),
                'github.response.status_code': response.status,
            });
            throw new GithubApiError(response.status, url.toString(), snippet);
        }

        const json = await response.json();
        const parsed = v.parse(schema, json);
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    });
}

/** Performs a GitHub REST API request and validates the response against the schema. */
export function githubApi<T>(
    path: string,
    schema: v.GenericSchema<unknown, T>,
    options: RequestJsonOptions = {},
) {
    return requestJson(apiBase, path, schema, options);
}

/** Performs a GitHub OAuth endpoint request and validates the response against the schema. */
export function oauthRequest<T>(
    path: string,
    schema: v.GenericSchema<unknown, T>,
    options: RequestJsonOptions = {},
) {
    return requestJson(oauthBase, path, schema, options);
}
