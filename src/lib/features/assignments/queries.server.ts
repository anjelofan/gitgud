import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { assignments, programs, rosterEntries, submissions, users } from '$lib/server/db/schema';
import type { DbConnection } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'assignments.queries';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export interface CreateAssignmentArgs {
    instructorId: string;
    programId: string;
    name: string;
    deadline: Date;
    templateRepo: string;
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
                name: rosterEntries.name,
                login: users.login,
                avatarUrl: users.avatarUrl,
                repoName: submissions.repoName,
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
            .select({ name: rosterEntries.name })
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
      }
    | { status: 'missing' }
    | { status: 'ambiguous' };

export async function resolveSubmissionForRepo(
    db: DbConnection,
    org: string,
    repoName: string,
): Promise<SubmissionLookup> {
    return await tracer.asyncSpan('resolve-submission-for-repo', async (span) => {
        span.setAttributes({ 'github.org': org, 'submission.repo_name': repoName });

        const rows = await db
            .select({
                submissionId: submissions.id,
                assignmentId: assignments.id,
                gradingWorkflow: assignments.gradingWorkflow,
            })
            .from(submissions)
            .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
            .innerJoin(programs, eq(assignments.programId, programs.id))
            .where(and(eq(programs.org, org), eq(submissions.repoName, repoName)))
            .limit(2);

        const [row, duplicate] = rows;
        if (typeof row === 'undefined') return { status: 'missing' };
        if (typeof duplicate !== 'undefined') return { status: 'ambiguous' };

        return { status: 'found', ...row };
    });
}
