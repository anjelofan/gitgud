import * as v from 'valibot';
import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { CheckRunAnnotationSchema, CheckRunSchema } from './contracts';
import { listCheckRunAnnotations, listCheckSuiteCheckRuns } from './checks';

const TOKEN = 'checks-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: 'checks-org',
        repo: 'graded-repo',
        checkSuiteId: 9001,
        checkRuns: [
            { id: 555, output: { annotations_count: 2 } },
            { id: 556, output: { annotations_count: 0 } },
        ],
    });
    await fakeGithub('registerCheckSuiteCheckRunsError', {
        token: TOKEN,
        owner: 'checks-org',
        repo: 'ghost-repo',
        checkSuiteId: 9001,
        status: 404,
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: 'checks-org',
        repo: 'graded-repo',
        checkRunId: 555,
        annotations: [
            { title: 'Autograding complete', message: 'Points 8/10' },
            { title: null, message: 'A plain annotation.' },
        ],
    });
    await fakeGithub('registerCheckRunAnnotationsError', {
        token: TOKEN,
        owner: 'checks-org',
        repo: 'graded-repo',
        checkRunId: 999,
        status: 404,
    });
});

describe('listCheckSuiteCheckRuns', () => {
    it('lists the check runs of a suite with their annotation counts', async () => {
        expect(await listCheckSuiteCheckRuns(TOKEN, 'checks-org', 'graded-repo', 9001)).toEqual({
            check_runs: [
                { id: 555, output: { annotations_count: 2 } },
                { id: 556, output: { annotations_count: 0 } },
            ],
        });
    });

    it('throws for a missing check suite (404)', async () => {
        await expect(
            listCheckSuiteCheckRuns(TOKEN, 'checks-org', 'ghost-repo', 9001),
        ).rejects.toThrow(/404/u);
    });
});

describe('listCheckRunAnnotations', () => {
    it('lists the annotations of a check run', async () => {
        expect(await listCheckRunAnnotations(TOKEN, 'checks-org', 'graded-repo', 555)).toEqual([
            { title: 'Autograding complete', message: 'Points 8/10' },
            { title: null, message: 'A plain annotation.' },
        ]);
    });

    it('throws for a missing check run (404)', async () => {
        await expect(
            listCheckRunAnnotations(TOKEN, 'checks-org', 'graded-repo', 999),
        ).rejects.toThrow(/404/u);
    });
});

describe('CheckRunSchema', () => {
    it('parses a check run carrying its annotation count', () => {
        expect(
            v.safeParse(CheckRunSchema, { id: 555, output: { annotations_count: 2 } }).success,
        ).toBe(true);
    });

    it('rejects a check run without an annotation count', () => {
        expect(v.safeParse(CheckRunSchema, { id: 555, output: {} }).success).toBe(false);
    });
});

describe('CheckRunAnnotationSchema', () => {
    it('parses an annotation without a title', () => {
        expect(
            v.safeParse(CheckRunAnnotationSchema, { title: null, message: 'Points 8/10' }).success,
        ).toBe(true);
    });

    it('rejects an annotation without a message', () => {
        expect(
            v.safeParse(CheckRunAnnotationSchema, { title: 'Autograding complete' }).success,
        ).toBe(false);
    });
});
