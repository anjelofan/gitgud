import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import { assignments, programs } from '$lib/server/db/schema';
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
            );
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
            .where(and(eq(assignments.id, assignmentId), eq(programs.instructorId, instructorId)));
        if (typeof row === 'undefined') return null;

        return { assignment: row.assignment, program: row.program };
    });
}
