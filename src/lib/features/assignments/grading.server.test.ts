import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { assignments, rosterEntries, submissions, users } from '$lib/server/db/schema';
import { createProgramWithRoster } from '$lib/features/programs/queries.server';
import { db } from '$lib/server/db';
import { fakeGithub } from '$tests/fake-github/client';

import { createAssignmentForProgram } from './queries.server';
import { recordGradingRun, refreshAssignmentScores, syncSubmissionScore } from './grading.server';

const TOKEN = 'grading-access-token';
const ORG = 'grading-org';
const INSTRUCTOR = { githubId: 301, login: 'grading-instructor', avatar_url: null };

const SCORED_RUN = {
    id: 8101,
    name: 'Autograding Tests',
    checkSuiteId: 9101,
    headSha: 'sha-scored',
    conclusion: 'success',
};
const FAILED_RUN = {
    id: 8102,
    name: 'Autograding Tests',
    checkSuiteId: 9102,
    headSha: 'sha-failed',
    conclusion: 'failure',
};
const PASSED_EARLIER_RUN = {
    id: 8100,
    name: 'Autograding Tests',
    checkSuiteId: 9103,
    headSha: 'sha-old',
    conclusion: 'success',
};
const LINT_RUN = {
    id: 8201,
    name: 'Lint',
    checkSuiteId: 9201,
    headSha: 'sha-lint',
    conclusion: 'success',
};

const UNRELATED_RUN = {
    id: 8300,
    name: 'Lint',
    checkSuiteId: 9110,
    headSha: 'sha-lint',
    conclusion: 'success',
};

beforeAll(async () => {
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkSuiteId: SCORED_RUN.checkSuiteId,
        checkRuns: [{ id: 5001, output: { annotations_count: 2 } }],
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkRunId: 5001,
        annotations: [
            { title: 'Build log', message: 'compiled in 4s' },
            { title: 'Autograding complete', message: 'Points 8/10' },
        ],
    });
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkSuiteId: FAILED_RUN.checkSuiteId,
        checkRuns: [{ id: 5002, output: { annotations_count: 1 } }],
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkRunId: 5002,
        annotations: [{ title: 'Build log', message: 'tests failed to compile' }],
    });
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkSuiteId: PASSED_EARLIER_RUN.checkSuiteId,
        checkRuns: [{ id: 5003, output: { annotations_count: 1 } }],
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkRunId: 5003,
        annotations: [{ title: 'Autograding complete', message: 'Points 4/10' }],
    });
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'lint-repo',
        checkSuiteId: LINT_RUN.checkSuiteId,
        checkRuns: [{ id: 5010, output: { annotations_count: 1 } }],
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: ORG,
        repo: 'lint-repo',
        checkRunId: 5010,
        annotations: [{ title: 'Lint', message: 'no issues found' }],
    });
    await fakeGithub('registerCheckSuiteCheckRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkSuiteId: UNRELATED_RUN.checkSuiteId,
        checkRuns: [{ id: 5011, output: { annotations_count: 1 } }],
    });
    await fakeGithub('registerCheckRunAnnotations', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        checkRunId: 5011,
        annotations: [{ title: 'Lint', message: 'no issues found' }],
    });
    await fakeGithub('registerWorkflowRuns', {
        token: TOKEN,
        owner: ORG,
        repo: 'graded-repo',
        runs: [
            {
                id: SCORED_RUN.id,
                name: SCORED_RUN.name,
                check_suite_id: SCORED_RUN.checkSuiteId,
                head_sha: SCORED_RUN.headSha,
                conclusion: SCORED_RUN.conclusion,
            },
        ],
    });
    await fakeGithub('registerWorkflowRunsError', {
        token: TOKEN,
        owner: ORG,
        repo: 'ghost-repo',
        status: 404,
    });
});

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values(INSTRUCTOR);
});

/** Creates a program whose single roster entry holds a submission for `repoName`. */
async function submissionFixture(repoName: string) {
    const [instructor] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.login, INSTRUCTOR.login));
    if (typeof instructor === 'undefined') throw new Error('instructor fixture missing');

    const program = await createProgramWithRoster(db, {
        creatorId: instructor.id,
        name: 'Grading Program',
        org: ORG,
        studentNames: ['Alice'],
    });
    const assignment = await createAssignmentForProgram(db, {
        instructorId: instructor.id,
        programId: program.id,
        name: 'Graded Assignment',
        deadline: new Date('2026-09-15T18:00:00.000Z'),
        templateRepo: 'grading-template',
    });
    if (assignment === null) throw new Error('assignment fixture missing');

    const [entry] = await db
        .select({ id: rosterEntries.id })
        .from(rosterEntries)
        .where(eq(rosterEntries.programId, program.id));
    if (typeof entry === 'undefined') throw new Error('roster fixture missing');

    const [submission] = await db
        .insert(submissions)
        .values({ assignmentId: assignment.id, rosterEntryId: entry.id, repoName })
        .returning();
    if (typeof submission === 'undefined') throw new Error('submission fixture missing');

    return { assignment, submission };
}

async function storedSubmission(submissionId: string) {
    const [stored] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (typeof stored === 'undefined') throw new Error('submission row missing');
    return stored;
}

async function storedGradingWorkflow(assignmentId: string) {
    const [stored] = await db
        .select({ gradingWorkflow: assignments.gradingWorkflow })
        .from(assignments)
        .where(eq(assignments.id, assignmentId));
    if (typeof stored === 'undefined') throw new Error('assignment row missing');
    return stored.gradingWorkflow;
}

describe('recordGradingRun', () => {
    it('records the score a grading run reported and learns its workflow', async () => {
        const { assignment, submission } = await submissionFixture('graded-repo');

        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'graded-repo',
                run: SCORED_RUN,
            }),
        ).toEqual({ status: 'recorded', score: { score: 8, maxScore: 10 } });

        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
        expect(stored.maxScore).toBe('10.00');
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
        expect(stored.gradingConclusion).toBe('success');
        expect(stored.gradingHeadSha).toBe('sha-scored');
        expect(stored.gradedAt).toBeInstanceOf(Date);

        expect(await storedGradingWorkflow(assignment.id)).toBe('Autograding Tests');
    });

    it('does not let an older run replace a newer grade', async () => {
        const { submission } = await submissionFixture('graded-repo');
        await recordGradingRun(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            run: SCORED_RUN,
        });

        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'graded-repo',
                run: PASSED_EARLIER_RUN,
            }),
        ).toEqual({ status: 'superseded' });

        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
    });

    it('lets a newer run replace an older grade', async () => {
        const { submission } = await submissionFixture('graded-repo');
        await recordGradingRun(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            run: PASSED_EARLIER_RUN,
        });

        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'graded-repo',
                run: SCORED_RUN,
            }),
        ).toEqual({ status: 'recorded', score: { score: 8, maxScore: 10 } });

        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
    });

    it('leaves the submission alone for a run that reports no score or grading marker', async () => {
        const { submission } = await submissionFixture('lint-repo');

        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'lint-repo',
                run: LINT_RUN,
            }),
        ).toEqual({ status: 'not-grading' });

        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBeNull();
        expect(stored.gradingRunId).toBeNull();
        expect(stored.gradedAt).toBeNull();
    });

    it('clears the score when the learned workflow later reports none', async () => {
        const { submission } = await submissionFixture('graded-repo');
        await recordGradingRun(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            run: SCORED_RUN,
        });

        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'graded-repo',
                run: FAILED_RUN,
            }),
        ).toEqual({ status: 'recorded', score: null });

        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBeNull();
        expect(stored.maxScore).toBeNull();
        expect(stored.gradingRunId).toBe(FAILED_RUN.id);
        expect(stored.gradingConclusion).toBe('failure');
        expect(stored.gradedAt).toBeInstanceOf(Date);
    });

    it('reports a repository that belongs to no submission', async () => {
        expect(
            await recordGradingRun(db, {
                token: TOKEN,
                org: ORG,
                repoName: 'unclaimed-repo',
                run: SCORED_RUN,
            }),
        ).toEqual({ status: 'submission-missing' });
    });
});

describe('syncSubmissionScore', () => {
    it('records the newest grading run, skipping a newer unrelated workflow', async () => {
        const { submission } = await submissionFixture('graded-repo');

        const outcome = await syncSubmissionScore(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            runs: [UNRELATED_RUN, SCORED_RUN],
        });

        expect(outcome).toEqual({ status: 'recorded', score: { score: 8, maxScore: 10 } });
        const stored = await storedSubmission(submission.id);
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
    });

    it('records the newest run even when the caller lists runs oldest first', async () => {
        const { submission } = await submissionFixture('graded-repo');

        const outcome = await syncSubmissionScore(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            runs: [PASSED_EARLIER_RUN, SCORED_RUN],
        });

        expect(outcome).toEqual({ status: 'recorded', score: { score: 8, maxScore: 10 } });
        const stored = await storedSubmission(submission.id);
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
    });

    it('leaves the submission untouched when no run is a grading run', async () => {
        const { submission } = await submissionFixture('graded-repo');

        const outcome = await syncSubmissionScore(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            runs: [UNRELATED_RUN],
        });

        expect(outcome).toEqual({ status: 'no-grading-run' });
        const stored = await storedSubmission(submission.id);
        expect(stored.gradingRunId).toBeNull();
    });

    it('reports an already-current grade instead of rewriting it', async () => {
        const { submission } = await submissionFixture('graded-repo');
        await recordGradingRun(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            run: SCORED_RUN,
        });

        const outcome = await syncSubmissionScore(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            runs: [SCORED_RUN, PASSED_EARLIER_RUN],
        });

        expect(outcome).toEqual({ status: 'superseded' });
        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
        expect(stored.gradingRunId).toBe(SCORED_RUN.id);
    });
});

describe('refreshAssignmentScores', () => {
    it('keeps pulling after a repository it cannot reach', async () => {
        const { submission } = await submissionFixture('graded-repo');

        const outcome = await refreshAssignmentScores(db, {
            token: TOKEN,
            org: ORG,
            repos: ['ghost-repo', 'graded-repo'],
        });

        expect(outcome).toEqual({ submitted: 2, recorded: 1, current: 0, failed: 1 });
        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
    });

    it('counts an already-current grade as current rather than failed', async () => {
        const { submission } = await submissionFixture('graded-repo');
        await recordGradingRun(db, {
            token: TOKEN,
            org: ORG,
            repoName: 'graded-repo',
            run: SCORED_RUN,
        });

        const outcome = await refreshAssignmentScores(db, {
            token: TOKEN,
            org: ORG,
            repos: ['graded-repo'],
        });

        expect(outcome).toEqual({ submitted: 1, recorded: 0, current: 1, failed: 0 });
        const stored = await storedSubmission(submission.id);
        expect(stored.score).toBe('8.00');
    });
});
