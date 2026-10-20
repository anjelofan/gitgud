import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import { assignments, programs, rosterEntries, submissions, users } from '$lib/server/db/schema';
import type { DbConnection, DbTransaction } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import type { GradingMode } from './contracts';

const SERVICE_NAME = 'assignments.queries';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export interface CreateAssignmentArgs {
    instructorId: string;
    programId: string;
    name: string;
    deadline: Date;
    templateRepo: string;
    gradingMode: GradingMode;
    maxScore?: number; // Should only be defined if gradingMode === 'manual'
}

/**
 * Creates a new assignment for a program after verifying instructor ownership
 */
export async function createAssignmentForProgram(db: DbConnection, args: CreateAssignmentArgs) {
    return await tracer.asyncSpan('create-assignment', async (span) => {
        span.setAttributes({
            'user.id': args.instructorId,
            'program.id': args.programId,
            'assignment.name': args.name,
        });

        // Checks if program exists and instructor is the owner; else return
        const [program] = await db
            .select({ id: programs.id })
            .from(programs)
            .where(
                and(eq(programs.id, args.programId), eq(programs.instructorId, args.instructorId)),
            )
            .limit(1);
        if (typeof program === 'undefined') return null;

        // Insert assignment into db
        const [assignment] = await db
            .insert(assignments)
            .values({
                programId: args.programId,
                name: args.name,
                deadline: args.deadline,
                templateRepo: args.templateRepo,
                gradingMode: args.gradingMode,
                maxScore: typeof args.maxScore === 'number' ? args.maxScore.toFixed(2) : null,
                inviteToken: randomBytes(32).toString('base64url'),
            })
            .returning();
        assert(typeof assignment !== 'undefined', 'assignment insert returned no row.');

        logger.info('assignment created', { 'assignment.id': assignment.id });
        return assignment;
    });
}

/** Lists assignments for a given program; latest/upcoming deadlines first*/
export async function listAssignmentsForProgram(db: DbConnection, programId: string) {
    return await tracer.asyncSpan('list-assignments-for-program', async (span) => {
        span.setAttribute('program.id', programId);

        return await db
            .select({ id: assignments.id, name: assignments.name, deadline: assignments.deadline })
            .from(assignments)
            .where(eq(assignments.programId, programId))
            .orderBy(desc(assignments.deadline));
    });
}

/** Fetches assignment by its id only if the instructor owns the parent program*/
export async function getAssignmentForInstructor(
    db: DbConnection,
    assignmentId: string,
    instructorId: string,
) {
    return await tracer.asyncSpan('get-assignment-for-instructor', async (span) => {
        span.setAttributes({ 'assignment.id': assignmentId, 'user.id': instructorId });

        const [row] = await db
            .select({
                assignment: assignments,
                program: { name: programs.name, org: programs.org },
            })
            .from(assignments)
            .innerJoin(programs, eq(assignments.programId, programs.id))
            .where(and(eq(assignments.id, assignmentId), eq(programs.instructorId, instructorId)))
            .limit(1);
        if (typeof row === 'undefined') return null;

        const students = await db
            .select({
                submissionId: submissions.id,
                name: rosterEntries.name,
                login: users.login,
                avatarUrl: users.avatarUrl,
                repoName: submissions.repoName,
                score: submissions.score,
                maxScore: submissions.maxScore,
                gradedAt: submissions.gradedAt,
                gradingConclusion: submissions.gradingConclusion,
            })
            .from(rosterEntries)
            .leftJoin(users, eq(rosterEntries.claimedUserId, users.id))
            .leftJoin(
                submissions,
                and(
                    eq(rosterEntries.id, submissions.rosterEntryId),
                    eq(submissions.assignmentId, row.assignment.id),
                ),
            )
            .where(eq(rosterEntries.programId, row.assignment.programId))
            .orderBy(rosterEntries.name);

        return { ...row, students };
    });
}

/**
 * Fetches the assignment an invitation token points to, including the parent
 * program context needed to accept it. Returns `null` for an unknown token.
 */
export async function getAssignmentByInviteToken(db: DbConnection, inviteToken: string) {
    return await tracer.asyncSpan('get-assignment-by-invite-token', async () => {
        const [row] = await db
            .select({
                assignment: assignments,
                program: {
                    id: programs.id,
                    name: programs.name,
                    org: programs.org,
                    instructorId: programs.instructorId,
                },
            })
            .from(assignments)
            .innerJoin(programs, eq(assignments.programId, programs.id))
            .where(eq(assignments.inviteToken, inviteToken))
            .limit(1);
        if (typeof row === 'undefined') return null;

        return { assignment: row.assignment, program: row.program };
    });
}

/** Lists the roster entry names of a program that no student has claimed yet. */
export async function listUnclaimedRosterEntries(db: DbConnection, programId: string) {
    return await tracer.asyncSpan('list-unclaimed-roster-entries', async (span) => {
        span.setAttribute('program.id', programId);

        return await db
            .select({ name: rosterEntries.name })
            .from(rosterEntries)
            .where(and(eq(rosterEntries.programId, programId), isNull(rosterEntries.claimedUserId)))
            .orderBy(rosterEntries.name);
    });
}

/**
 * Returns the submission the user has for an assignment — through the roster
 * entry they claimed — or `null` when they have not accepted it yet.
 */
export async function getAcceptedSubmissionForUser(
    db: DbConnection,
    assignmentId: string,
    userId: string,
) {
    return await tracer.asyncSpan('get-accepted-submission-for-user', async (span) => {
        span.setAttributes({ 'assignment.id': assignmentId, 'user.id': userId });

        const [submission] = await db
            .select({ repoName: submissions.repoName })
            .from(submissions)
            .innerJoin(rosterEntries, eq(submissions.rosterEntryId, rosterEntries.id))
            .where(
                and(
                    eq(submissions.assignmentId, assignmentId),
                    eq(rosterEntries.claimedUserId, userId),
                ),
            )
            .limit(1);
        if (typeof submission === 'undefined') return null;

        return submission;
    });
}

/** Returns the roster entry the user has claimed in a program, if any. */
export async function getClaimedRosterEntry(db: DbConnection, programId: string, userId: string) {
    return await tracer.asyncSpan('get-claimed-roster-entry', async (span) => {
        span.setAttributes({ 'program.id': programId, 'user.id': userId });

        const [entry] = await db
            .select({ id: rosterEntries.id, name: rosterEntries.name })
            .from(rosterEntries)
            .where(
                and(
                    eq(rosterEntries.programId, programId),
                    eq(rosterEntries.claimedUserId, userId),
                ),
            )
            .limit(1);
        if (typeof entry === 'undefined') return null;

        return entry;
    });
}

/**
 * Resolves the submission a repository belongs to. A repository identifies a
 * submission only by the program org it lives in and its name, so `ambiguous`
 * means two assignments claim the same repository — a state the caller must
 * refuse to grade rather than guess between.
 */
export type SubmissionLookup =
    | {
          status: 'found';
          submissionId: string;
          assignmentId: string;
          gradingWorkflow: string | null;
          gradingMode: GradingMode;
      }
    | { status: 'missing' }
    | { status: 'ambiguous' };

const submissionLookupColumns = {
    submissionId: submissions.id,
    assignmentId: assignments.id,
    gradingWorkflow: assignments.gradingWorkflow,
    gradingMode: assignments.gradingMode,
} as const;

function submissionLookupWhere(org: string, repoName: string) {
    return and(eq(programs.org, org), eq(submissions.repoName, repoName));
}

interface SubmissionLookupRow {
    submissionId: string;
    assignmentId: string;
    gradingWorkflow: string | null;
    gradingMode: GradingMode;
}

function toSubmissionLookup(rows: SubmissionLookupRow[]): SubmissionLookup {
    const [row, duplicate] = rows;
    if (typeof row === 'undefined') return { status: 'missing' };
    if (typeof duplicate !== 'undefined') return { status: 'ambiguous' };
    return { status: 'found', ...row };
}

export async function resolveSubmissionForRepo(
    db: DbConnection,
    org: string,
    repoName: string,
): Promise<SubmissionLookup> {
    return await tracer.asyncSpan('resolve-submission-for-repo', async (span) => {
        span.setAttributes({ 'github.org': org, 'submission.repo_name': repoName });

        const rows = await db
            .select(submissionLookupColumns)
            .from(submissions)
            .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
            .innerJoin(programs, eq(assignments.programId, programs.id))
            .where(submissionLookupWhere(org, repoName))
            .limit(2);

        return toSubmissionLookup(rows);
    });
}

/**
 * Resolves the submission a repository belongs to while holding a row lock on
 * it, so a caller can decide and write against the same row without a deletion
 * or a competing grade slipping in between. The lookup predicate is part of the
 * locked statement, so only a row the caller may grade is ever locked.
 */
export async function lockSubmissionForRepo(
    tx: DbTransaction,
    org: string,
    repoName: string,
): Promise<SubmissionLookup> {
    return await tracer.asyncSpan('lock-submission-for-repo', async (span) => {
        span.setAttributes({ 'github.org': org, 'submission.repo_name': repoName });

        const rows = await tx
            .select(submissionLookupColumns)
            .from(submissions)
            .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
            .innerJoin(programs, eq(assignments.programId, programs.id))
            .where(submissionLookupWhere(org, repoName))
            .limit(2)
            .for('update');

        return toSubmissionLookup(rows);
    });
}

/**
 * Writes a manual score, scoped to the assignment the caller may grade: the
 * submission id alone would let a caller touch a row outside that assignment.
 */
export async function setSubmissionScore(
    db: DbConnection,
    submissionId: string,
    assignmentId: string,
    score: string,
    maxScore: string,
) {
    return await tracer.asyncSpan('set-submission-score', async (span) => {
        span.setAttributes({ 'submission.id': submissionId, 'assignment.id': assignmentId });

        return await db
            .update(submissions)
            .set({
                score,
                maxScore,
                gradedAt: new Date(),
                gradingConclusion: null,
            })
            .where(
                and(eq(submissions.id, submissionId), eq(submissions.assignmentId, assignmentId)),
            )
            .returning({ id: submissions.id });
    });
}

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

export type ClaimRosterEntryOutcome =
    { rosterEntryId: string } | { status: 'entry-missing' | 'entry-claimed' };

function isUniqueViolation(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505'
    );
}

/**
 * Claims the named roster entry for the user. The conditional UPDATE is what
 * makes the claim atomic: an entry another student claimed first matches no
 * row, and the follow-up lookup says whether the name exists at all.
 */
export async function claimRosterEntry(
    db: DbConnection,
    args: { programId: string; userId: string; entryName: string },
): Promise<ClaimRosterEntryOutcome> {
    return await tracer.asyncSpan('claim-roster-entry', async (span) => {
        span.setAttributes({ 'program.id': args.programId, 'user.id': args.userId });

        let claimedRows: { id: string }[];
        try {
            claimedRows = await db
                .update(rosterEntries)
                .set({ claimedUserId: args.userId, claimedAt: new Date() })
                .where(
                    and(
                        eq(rosterEntries.programId, args.programId),
                        eq(rosterEntries.name, args.entryName),
                        isNull(rosterEntries.claimedUserId),
                    ),
                )
                .returning({ id: rosterEntries.id });
        } catch (error) {
            // Two concurrent claims by the same user trip the
            // `(programId, claimedUserId)` unique index; use whichever entry won.
            if (!isUniqueViolation(error)) throw error;

            const winners = await db
                .select({ id: rosterEntries.id })
                .from(rosterEntries)
                .where(
                    and(
                        eq(rosterEntries.programId, args.programId),
                        eq(rosterEntries.claimedUserId, args.userId),
                    ),
                )
                .limit(1);
            const [winner] = winners;
            assert(typeof winner !== 'undefined', 'concurrent claim left no winning entry');
            claimedRows = [winner];
        }
        const [claimedRow] = claimedRows;

        if (typeof claimedRow === 'undefined') {
            const [existing] = await db
                .select({ id: rosterEntries.id, claimedUserId: rosterEntries.claimedUserId })
                .from(rosterEntries)
                .where(
                    and(
                        eq(rosterEntries.programId, args.programId),
                        eq(rosterEntries.name, args.entryName),
                    ),
                )
                .limit(1);

            if (typeof existing !== 'undefined') {
                // The user's own concurrent request may have claimed this entry
                // between our conditional UPDATE and this lookup; treat that as
                // success rather than a conflict.
                if (existing.claimedUserId === args.userId) {
                    span.setAttribute('roster.entry_id', existing.id);
                    return { rosterEntryId: existing.id };
                }
                return { status: 'entry-claimed' };
            }

            logger.debug('roster entry not found for the given name', {
                'program.id': args.programId,
            });
            return { status: 'entry-missing' };
        }

        span.setAttribute('roster.entry_id', claimedRow.id);
        return { rosterEntryId: claimedRow.id };
    });
}

/** Reads the submission recorded for an assignment and repository name, if any. */
export async function getSubmissionByRepoName(
    db: DbConnection,
    assignmentId: string,
    repoName: string,
) {
    return await tracer.asyncSpan('get-submission-by-repo-name', async (span) => {
        span.setAttributes({ 'assignment.id': assignmentId, 'submission.repo_name': repoName });

        const [submission] = await db
            .select({ repoName: submissions.repoName })
            .from(submissions)
            .where(
                and(eq(submissions.assignmentId, assignmentId), eq(submissions.repoName, repoName)),
            )
            .limit(1);
        if (typeof submission === 'undefined') return null;

        return submission;
    });
}

/** Records the submission a student's accepted assignment created. */
export async function recordSubmission(
    db: DbConnection,
    assignmentId: string,
    rosterEntryId: string,
    repoName: string,
) {
    return await tracer.asyncSpan('record-submission', async (span) => {
        span.setAttributes({
            'assignment.id': assignmentId,
            'submission.roster_entry_id': rosterEntryId,
            'submission.repo_name': repoName,
        });

        await db
            .insert(submissions)
            .values({ assignmentId, rosterEntryId, repoName })
            .onConflictDoNothing();
    });
}

/**
 * Writes one completed run's grade, guarded by the monotonic run id so a
 * redelivered or out-of-order delivery cannot overwrite a newer grade. Returns
 * whether the row was written; a locked, existing submission that matches no
 * row means an equal-or-newer run is already stored.
 */
export async function writeGradingRunSubmission(
    tx: DbTransaction,
    args: { submissionId: string; run: GradingRun; score: GradingRunScore | null },
) {
    return await tracer.asyncSpan('write-grading-run-submission', async (span) => {
        span.setAttributes({
            'submission.id': args.submissionId,
            'github.workflow_run.id': args.run.id,
        });

        const updated = await tx
            .update(submissions)
            .set({
                score: args.score === null ? null : args.score.score.toFixed(2),
                maxScore: args.score === null ? null : args.score.maxScore.toFixed(2),
                gradedAt: sql`now()`,
                gradingRunId: args.run.id,
                gradingConclusion: args.run.conclusion,
                gradingHeadSha: args.run.headSha,
            })
            .where(
                and(
                    eq(submissions.id, args.submissionId),
                    or(isNull(submissions.gradingRunId), lt(submissions.gradingRunId, args.run.id)),
                ),
            );

        const { rowCount } = updated;
        assert(rowCount !== null, 'submission update returned no row count');
        return rowCount > 0;
    });
}

/** Learns the assignment's grading workflow from the first run that reported a score. */
export async function learnGradingWorkflow(
    tx: DbTransaction,
    assignmentId: string,
    workflowName: string,
) {
    return await tracer.asyncSpan('learn-grading-workflow', async (span) => {
        span.setAttributes({
            'assignment.id': assignmentId,
            'github.workflow_run.name': workflowName,
        });

        await tx
            .update(assignments)
            .set({ gradingWorkflow: workflowName })
            .where(eq(assignments.id, assignmentId));
    });
}
