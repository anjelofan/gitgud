import * as v from 'valibot';
import { beforeAll, describe, expect, it } from 'vitest';

import { fakeGithub } from '$tests/fake-github/client';

import { listCompletedWorkflowRuns } from './actions';
import { WorkflowRunSchema } from './contracts';

const TOKEN = 'actions-access-token';

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerWorkflowRuns', {
        token: TOKEN,
        owner: 'actions-org',
        repo: 'graded-repo',
        runs: [
            {
                id: 7002,
                name: 'Autograding Tests',
                check_suite_id: 9002,
                head_sha: 'sha-two',
                conclusion: 'success',
            },
            {
                id: 7001,
                name: 'Autograding Tests',
                check_suite_id: 9001,
                head_sha: 'sha-one',
                conclusion: 'failure',
            },
        ],
    });
    await fakeGithub('registerWorkflowRunsError', {
        token: TOKEN,
        owner: 'actions-org',
        repo: 'ghost-repo',
        status: 404,
    });
});

describe('listCompletedWorkflowRuns', () => {
    it('lists the completed runs of a repository with their check suites', async () => {
        expect(await listCompletedWorkflowRuns(TOKEN, 'actions-org', 'graded-repo')).toEqual({
            workflow_runs: [
                {
                    id: 7002,
                    name: 'Autograding Tests',
                    check_suite_id: 9002,
                    head_sha: 'sha-two',
                    conclusion: 'success',
                },
                {
                    id: 7001,
                    name: 'Autograding Tests',
                    check_suite_id: 9001,
                    head_sha: 'sha-one',
                    conclusion: 'failure',
                },
            ],
        });
    });

    it('throws for an unknown repository (404)', async () => {
        await expect(listCompletedWorkflowRuns(TOKEN, 'actions-org', 'ghost-repo')).rejects.toThrow(
            /404/u,
        );
    });
});

describe('WorkflowRunSchema', () => {
    it('parses a run whose conclusion is not recorded', () => {
        expect(
            v.safeParse(WorkflowRunSchema, {
                id: 7001,
                name: 'Autograding Tests',
                check_suite_id: 9001,
                head_sha: 'sha-one',
                conclusion: null,
            }).success,
        ).toBe(true);
    });

    it('rejects a run without a check suite id', () => {
        expect(
            v.safeParse(WorkflowRunSchema, {
                id: 7001,
                name: 'Autograding Tests',
                head_sha: 'sha-one',
                conclusion: 'success',
            }).success,
        ).toBe(false);
    });
});
