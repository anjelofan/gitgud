import { assertNever } from '$lib/assert';
import type { DbConnection } from '$lib/server/db';
import { listCheckRunAnnotations, listCheckSuiteCheckRuns } from '$lib/server/github/checks';
import { listCompletedWorkflowRuns } from '$lib/server/github/actions';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import type { WorkflowRun } from '$lib/server/github/contracts';

import {
    type GradingRun,
    type GradingRunScore,
    learnGradingWorkflow,
    lockSubmissionForRepo,
    resolveSubmissionForRepo,
    writeGradingRunSubmission,
} from './queries.server';
import { parseAutogradingScore } from './autograding';

const SERVICE_NAME = 'assignments.grading';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export type RecordGradingOutcome =
    | { status: 'recorded'; score: GradingRunScore | null }
    | { status: 'superseded' }
    | { status: 'not-grading' }
    | { status: 'manual-assignment' }
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
) {
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
 *
 * The score is read before the write transaction so no row lock is held across
 * GitHub calls; the submission is then locked and re-resolved inside the
 * transaction, so `superseded` always means a newer run is stored rather than a
 * submission that vanished mid-flight.
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

        if (lookup.gradingMode === 'manual') {
            logger.debug('assignment is graded manually; ignoring an autograded run', {
                'assignment.id': lookup.assignmentId,
                'github.workflow_run.id': args.run.id,
            });
            return { status: 'manual-assignment' };
        }

        const score = await readGradingRunScore(
            args.token,
            args.org,
            args.repoName,
            args.run.checkSuiteId,
        );

        return await db.transaction(async (tx) => {
            const locked = await lockSubmissionForRepo(tx, args.org, args.repoName);
            if (locked.status === 'missing') {
                logger.debug('submission vanished before its grading run was recorded', {
                    'github.org': args.org,
                    'submission.repo_name': args.repoName,
                });
                return { status: 'submission-missing' };
            }
            if (locked.status === 'ambiguous') {
                logger.warn('workflow run matches more than one submission', {
                    'github.org': args.org,
                    'submission.repo_name': args.repoName,
                });
                return { status: 'submission-ambiguous' };
            }

            span.setAttribute('assignment.id', locked.assignmentId);

            if (locked.gradingMode === 'manual') return { status: 'manual-assignment' };

            if (score === null && locked.gradingWorkflow !== args.run.name)
                return { status: 'not-grading' };

            const recorded = await writeGradingRunSubmission(tx, {
                submissionId: locked.submissionId,
                run: args.run,
                score,
            });
            if (!recorded) return { status: 'superseded' };

            if (score !== null && locked.gradingWorkflow === null)
                await learnGradingWorkflow(tx, locked.assignmentId, args.run.name);

            logger.info('recorded a grading run', {
                'assignment.id': locked.assignmentId,
                'submission.id': locked.submissionId,
                'github.workflow_run.id': args.run.id,
                'grading.conclusion': args.run.conclusion,
            });

            return { status: 'recorded', score };
        });
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

/** Adapts a GitHub workflow run to the shape the grading policy works in. */
export function toGradingRun(run: WorkflowRun): GradingRun {
    return {
        id: run.id,
        name: run.name,
        checkSuiteId: run.check_suite_id,
        headSha: run.head_sha,
        conclusion: run.conclusion,
    };
}

export interface RefreshOutcome {
    submitted: number;
    recorded: number;
    current: number;
    noScoreFound: number;
    failed: number;
}

/**
 * Pulls one repository's current score, translating an unreachable repository
 * into `failed` so that a single bad repository cannot abandon the batch. A
 * repository with no grading run is reported as `no-score-found`, distinct from
 * a stored grade the newest run already agrees with.
 */
async function pullSubmissionScore(
    db: DbConnection,
    args: { token: string; org: string },
    repoName: string,
) {
    try {
        const { workflow_runs: runs } = await listCompletedWorkflowRuns(
            args.token,
            args.org,
            repoName,
        );
        const result = await syncSubmissionScore(db, {
            token: args.token,
            org: args.org,
            repoName,
            runs: runs.map(toGradingRun),
        });

        switch (result.status) {
            case 'recorded':
                return 'recorded';
            case 'superseded':
                return 'current';
            case 'not-grading':
            case 'manual-assignment':
            case 'no-grading-run':
                return 'no-score-found';
            case 'submission-missing':
            case 'submission-ambiguous':
                return 'failed';
            default:
                assertNever(result);
        }
    } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        logger.error('pulling a submission score failed', cause, {
            'github.org': args.org,
            'submission.repo_name': repoName,
        });

        return 'failed';
    }
}

/**
 * Pulls the current score of every submitted repository of an assignment. One
 * unreachable repository must not abandon the rest of the batch, so a failure
 * is counted and logged rather than thrown; `current` counts repositories
 * whose stored grade the newest run already agrees with.
 */
export async function refreshAssignmentScores(
    db: DbConnection,
    args: { token: string; org: string; repos: string[] },
) {
    return await tracer.asyncSpan('refresh-assignment-scores', async (span) => {
        span.setAttributes({
            'github.org': args.org,
            'grading.repository_count': args.repos.length,
        });

        const outcome: RefreshOutcome = {
            submitted: args.repos.length,
            recorded: 0,
            current: 0,
            noScoreFound: 0,
            failed: 0,
        };

        for (const repoName of args.repos) {
            const result = await pullSubmissionScore(db, args, repoName);
            switch (result) {
                case 'recorded':
                    outcome.recorded += 1;
                    break;
                case 'current':
                    outcome.current += 1;
                    break;
                case 'no-score-found':
                    outcome.noScoreFound += 1;
                    break;
                case 'failed':
                    outcome.failed += 1;
                    break;
                default:
                    assertNever(result);
            }
        }

        span.setAttributes({
            'grading.recorded': outcome.recorded,
            'grading.current': outcome.current,
            'grading.no_score_found': outcome.noScoreFound,
            'grading.failed': outcome.failed,
        });

        return outcome;
    });
}
