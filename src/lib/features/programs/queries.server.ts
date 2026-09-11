import assert from 'node:assert/strict';

import { and, desc, eq } from 'drizzle-orm';

import type { DbConnection } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { programs, rosterEntries } from '$lib/server/db/schema';
import { Tracer } from '$lib/server/telemetry/tracer';

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
