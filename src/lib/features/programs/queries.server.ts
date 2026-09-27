import assert from 'node:assert/strict';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseError } from 'pg';

import type { DbConnection } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { programs, rosterEntries } from '$lib/server/db/schema';
import { Tracer } from '$lib/server/telemetry/tracer';

import { namesToAdd, rosterCapacityExceeded } from './roster.ts';

const SERVICE_NAME = 'programs.queries';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export interface CreateProgramArgs {
    creatorId: string;
    name: string;
    org: string;
    studentNames: string[];
}

/** Inserts the program and its whole roster in a single transaction. */
export async function createProgramWithRoster(db: DbConnection, args: CreateProgramArgs) {
    return await tracer.asyncSpan('create-program-with-roster', async (span) => {
        span.setAttributes({
            'user.id': args.creatorId,
            'program.name': args.name,
            'program.org': args.org,
            'program.roster_size': args.studentNames.length,
        });

        return await db.transaction(async (tx) => {
            const inserted = await tx
                .insert(programs)
                .values({ name: args.name, org: args.org, instructorId: args.creatorId })
                .returning();
            const [program] = inserted;
            assert(typeof program !== 'undefined', 'program insert returned no row.');

            if (args.studentNames.length > 0)
                await tx
                    .insert(rosterEntries)
                    .values(args.studentNames.map((name) => ({ programId: program.id, name })));
            logger.info('program created', {
                'program.id': program.id,
                'program.roster_size': args.studentNames.length,
            });

            return program;
        });
    });
}

/**
 * Fetches a program with its roster for the owning instructor only; the
 * authorization predicate lives in the query itself. Returns `null` when the
 * program does not exist or belongs to someone else.
 */
export async function getProgramForInstructor(
    db: DbConnection,
    programId: string,
    instructorId: string,
) {
    return await tracer.asyncSpan('get-program-for-instructor', async (span) => {
        span.setAttributes({ 'program.id': programId, 'user.id': instructorId });

        const rows = await db
            .select({ program: programs, rosterEntry: rosterEntries })
            .from(programs)
            .leftJoin(rosterEntries, eq(rosterEntries.programId, programs.id))
            .where(and(eq(programs.id, programId), eq(programs.instructorId, instructorId)))
            .orderBy(rosterEntries.name);
        const [first] = rows;
        if (typeof first === 'undefined') return null;

        const students = rows.flatMap((row) => (row.rosterEntry === null ? [] : [row.rosterEntry]));
        return { program: first.program, students };
    });
}

function isUniqueNameViolation(error: unknown) {
    return error instanceof DatabaseError && error.code === '23505';
}

type DbTransaction = Parameters<Parameters<DbConnection['transaction']>[0]>[0];

/** Locks the program row when the instructor owns it. A missing id and another owner's program both return null. */
async function lockOwnedProgram(tx: DbTransaction, programId: string, instructorId: string) {
    const locked = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(and(eq(programs.id, programId), eq(programs.instructorId, instructorId)))
        .limit(1)
        .for('update');
    const [program] = locked;
    return program ?? null;
}

/** Adds net-new student names to an owned program roster. */
export async function addStudentsToProgram(
    db: DbConnection,
    args: { programId: string; instructorId: string; names: string[] },
) {
    return await tracer.asyncSpan('add-students-to-program', async (span) => {
        span.setAttributes({
            'program.id': args.programId,
            'user.id': args.instructorId,
            'program.roster_add_count': args.names.length,
        });

        try {
            const outcome = await db.transaction(async (tx) => {
                const program = await lockOwnedProgram(tx, args.programId, args.instructorId);
                if (program === null)
                    return { ok: false as const, error: { kind: 'not-owner' as const } };

                const existing = await tx
                    .select({ name: rosterEntries.name })
                    .from(rosterEntries)
                    .where(eq(rosterEntries.programId, args.programId));
                const newNames = namesToAdd(
                    existing.map((entry) => entry.name),
                    args.names,
                );
                if (newNames.length === 0)
                    return { ok: false as const, error: { kind: 'no-new-names' as const } };

                const capacityMessage = rosterCapacityExceeded(existing.length, newNames.length);
                if (capacityMessage !== null)
                    return {
                        ok: false as const,
                        error: { kind: 'capacity-exceeded' as const, message: capacityMessage },
                    };

                await tx
                    .insert(rosterEntries)
                    .values(newNames.map((name) => ({ programId: args.programId, name })));
                return { ok: true as const, added: newNames.length };
            });

            if (outcome.ok)
                logger.info('students added to roster', {
                    'program.id': args.programId,
                    'program.roster_added': outcome.added,
                });
            return outcome;
        } catch (error) {
            if (isUniqueNameViolation(error))
                return { ok: false as const, error: { kind: 'name-conflict' as const } };
            throw error;
        }
    });
}

/** Renames one roster entry when it belongs to an instructor-owned program. */
export async function renameRosterEntry(
    db: DbConnection,
    args: { programId: string; instructorId: string; entryId: string; name: string },
) {
    return await tracer.asyncSpan('rename-roster-entry', async (span) => {
        span.setAttributes({
            'program.id': args.programId,
            'user.id': args.instructorId,
            'roster.entry_id': args.entryId,
        });

        try {
            const outcome = await db.transaction(async (tx) => {
                const program = await lockOwnedProgram(tx, args.programId, args.instructorId);
                if (program === null)
                    return { ok: false as const, error: { kind: 'not-owner' as const } };

                const existing = await tx
                    .select({ id: rosterEntries.id, name: rosterEntries.name })
                    .from(rosterEntries)
                    .where(eq(rosterEntries.programId, program.id));
                const entry = existing.find((student) => student.id === args.entryId);
                if (typeof entry === 'undefined')
                    return { ok: false as const, error: { kind: 'not-found' as const } };

                if (entry.name === args.name) return { ok: true as const };

                const nameTaken = existing.some(
                    (student) => student.name === args.name && student.id !== args.entryId,
                );
                if (nameTaken)
                    return { ok: false as const, error: { kind: 'name-conflict' as const } };

                const result = await tx
                    .update(rosterEntries)
                    .set({ name: args.name })
                    .where(
                        and(
                            eq(rosterEntries.id, args.entryId),
                            eq(rosterEntries.programId, program.id),
                        ),
                    );
                if (result.rowCount !== 1)
                    return { ok: false as const, error: { kind: 'not-found' as const } };
                return { ok: true as const };
            });

            if (outcome.ok)
                logger.info('roster entry renamed', {
                    'program.id': args.programId,
                    'roster.entry_id': args.entryId,
                });
            return outcome;
        } catch (error) {
            if (isUniqueNameViolation(error))
                return { ok: false as const, error: { kind: 'name-conflict' as const } };
            throw error;
        }
    });
}

/** Removes roster entries from an instructor-owned program. */
export async function removeRosterEntries(
    db: DbConnection,
    args: { programId: string; instructorId: string; entryIds: string[] },
) {
    return await tracer.asyncSpan('remove-roster-entries', async (span) => {
        const entryIds = [...new Set(args.entryIds)];
        span.setAttributes({
            'program.id': args.programId,
            'user.id': args.instructorId,
            'program.roster_remove_count': entryIds.length,
        });

        const outcome = await db.transaction(async (tx) => {
            const program = await lockOwnedProgram(tx, args.programId, args.instructorId);
            if (program === null)
                return { ok: false as const, error: { kind: 'not-owner' as const } };

            const existing = await tx
                .select({ id: rosterEntries.id })
                .from(rosterEntries)
                .where(eq(rosterEntries.programId, args.programId));
            const ownedIds = new Set(existing.map((entry) => entry.id));
            const unknownId = entryIds.find((entryId) => !ownedIds.has(entryId));
            if (typeof unknownId !== 'undefined')
                return { ok: false as const, error: { kind: 'not-found' as const } };

            const result = await tx
                .delete(rosterEntries)
                .where(
                    and(
                        eq(rosterEntries.programId, args.programId),
                        inArray(rosterEntries.id, entryIds),
                    ),
                );
            const removed = result.rowCount;
            if (removed !== entryIds.length)
                throw new Error(
                    `Expected to remove ${entryIds.length} roster entries, removed ${removed}.`,
                );
            return { ok: true as const, removed };
        });

        if (outcome.ok)
            logger.info('roster entries removed', {
                'program.id': args.programId,
                'program.roster_removed': outcome.removed,
            });
        return outcome;
    });
}

/** Lists the programs an instructor created, newest first. */
export async function listOwnedPrograms(db: DbConnection, instructorId: string) {
    return await tracer.asyncSpan('list-owned-programs', async (span) => {
        span.setAttribute('user.id', instructorId);

        return await db
            .select({
                id: programs.id,
                name: programs.name,
                org: programs.org,
                createdAt: programs.createdAt,
            })
            .from(programs)
            .where(eq(programs.instructorId, instructorId))
            .orderBy(desc(programs.createdAt));
    });
}
