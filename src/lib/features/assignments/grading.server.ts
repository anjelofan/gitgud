import assert from 'node:assert/strict';

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { assignments, submissions } from '$lib/server/db/schema';
import type { DbConnection } from '$lib/server/db';
import { listCheckRunAnnotations, listCheckSuiteCheckRuns } from '$lib/server/github/checks';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { parseAutogradingScore } from './grading';
import { resolveSubmissionForRepo } from './queries.server';

const SERVICE_NAME = 'assignments.grading';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

/** A completed workflow run, in the shape both the webhook and the polling path see it. */
export interface GradingRun {
    id: number;
    name: string;
    checkSuiteId: number;
    headSha: string;
    conclusion: string | null;
}

export interface GradingRunScore {
    score: number;
    maxScore: number;
}

export type RecordGradingOutcome =
    | { status: 'recorded'; score: GradingRunScore | null }
    | { status: 'superseded' }
    | { status: 'not-grading' }
    | { status: 'submission-missing' }
    | { status: 'submission-ambiguous' };

/**
 * Reads the score a run reported by scanning the annotations of its check runs.
 * Both GitHub Classroom's reporter and GitGud's own marker attach the score as
 * a notice annotation; a run that reports none — a failing build, a workflow
 * that has nothing to do with grading — yields `null`.
 */
async function readGradingRunScore(
    token: string,
    org: string,
    repoName: string,
    checkSuiteId: number,
): Promise<GradingRunScore | null> {
    return await tracer.asyncSpan('read-grading-run-score', async (span) => {
        span.setAttributes({
            'github.org': org,
            'submission.repo_name': repoName,
            'github.check_suite.id': checkSuiteId,
        });

        const { check_runs: checkRuns } = await listCheckSuiteCheckRuns(
            token,
            org,
            repoName,
            checkSuiteId,
        );

        for (const checkRun of checkRuns) {
            // Only a check run that carries annotations can carry the marker.
            if (checkRun.output.annotations_count === 0) continue;

            const annotations = await listCheckRunAnnotations(token, org, repoName, checkRun.id);
            for (const annotation of annotations) {
                const score = parseAutogradingScore(annotation.title, annotation.message);
                if (score === null) continue;

                span.setAttributes({
                    'grading.score': score.score,
                    'grading.max_score': score.maxScore,
                });
                return score;
            }
        }

        return null;
    });
}

/**
 * Records one completed workflow run against the submission its repository
 * belongs to. A run counts as a grading run when it reports a score, or when it
 * is the workflow the assignment already learned — the latter is what lets a
 * failing autograding run supersede an earlier passing one instead of being
 * mistaken for an unrelated workflow. The stored run id is monotonic, so a
 * redelivered or late webhook cannot overwrite a newer grade.
 */
export async function recordGradingRun(
    db: DbConnection,
    args: { token: string; org: string; repoName: string; run: GradingRun },
): Promise<RecordGradingOutcome> {
    return await tracer.asyncSpan('record-grading-run', async (span) => {
        span.setAttributes({
            'github.org': args.org,
            'submission.repo_name': args.repoName,
            'github.workflow_run.id': args.run.id,
            'github.workflow_run.name': args.run.name,
        });

        const lookup = await resolveSubmissionForRepo(db, args.org, args.repoName);
        if (lookup.status === 'missing') {
            logger.debug('workflow run belongs to no submission', {
                'github.org': args.org,
                'submission.repo_name': args.repoName,
            });
            return { status: 'submission-missing' };
        }
        if (lookup.status === 'ambiguous') {
            logger.warn('workflow run matches more than one submission', {
                'github.org': args.org,
                'submission.repo_name': args.repoName,
            });
            return { status: 'submission-ambiguous' };
        }

        span.setAttribute('assignment.id', lookup.assignmentId);

        const score = await readGradingRunScore(
            args.token,
            args.org,
            args.repoName,
            args.run.checkSuiteId,
        );
        if (score === null && lookup.gradingWorkflow !== args.run.name)
            return { status: 'not-grading' };

        const updated = await db
            .update(submissions)
            .set({
                score: score === null ? null : score.score.toFixed(2),
                maxScore: score === null ? null : score.maxScore.toFixed(2),
                gradedAt: sql`now()`,
                gradingRunId: args.run.id,
                gradingConclusion: args.run.conclusion,
                gradingHeadSha: args.run.headSha,
            })
            .where(
                and(
                    eq(submissions.id, lookup.submissionId),
                    or(isNull(submissions.gradingRunId), lt(submissions.gradingRunId, args.run.id)),
                ),
            );

        const { rowCount } = updated;
        assert(rowCount !== null, 'submission update returned no row count');
        if (rowCount === 0) return { status: 'superseded' };

        if (score !== null && lookup.gradingWorkflow === null) {
            await db
                .update(assignments)
                .set({ gradingWorkflow: args.run.name })
                .where(eq(assignments.id, lookup.assignmentId));
            logger.info('learned the grading workflow of an assignment', {
                'assignment.id': lookup.assignmentId,
                'github.workflow_run.name': args.run.name,
            });
        }

        logger.info('recorded a grading run', {
            'assignment.id': lookup.assignmentId,
            'submission.id': lookup.submissionId,
            'github.workflow_run.id': args.run.id,
            'grading.conclusion': args.run.conclusion,
        });

        return { status: 'recorded', score };
    });
}

/**
 * Walks a repository's recent completed runs newest-first and records the first
 * grading run among them, so an instructor can pull scores without waiting for
 * a delivery. Runs belonging to other workflows are skipped, and `superseded`
 * is the steady state once an equal or newer run is already stored.
 */
export async function syncSubmissionScore(
    db: DbConnection,
    args: { token: string; org: string; repoName: string; runs: GradingRun[] },
): Promise<RecordGradingOutcome | { status: 'no-grading-run' }> {
    return await tracer.asyncSpan('sync-submission-score', async (span) => {
        span.setAttributes({
            'github.org': args.org,
            'submission.repo_name': args.repoName,
            'grading.run_count': args.runs.length,
        });

        // GitHub answers newest first, but that ordering is not a documented
        // contract, so the newest run is chosen by the monotonic run id.
        const newestFirst = [...args.runs].sort((left, right) => right.id - left.id);
        for (const run of newestFirst) {
            const outcome = await recordGradingRun(db, {
                token: args.token,
                org: args.org,
                repoName: args.repoName,
                run,
            });
            if (outcome.status !== 'not-grading') return outcome;
        }

        return { status: 'no-grading-run' };
    });
}
