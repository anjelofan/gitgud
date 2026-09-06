import assert from 'node:assert/strict';

import { and, desc, eq } from 'drizzle-orm';

import { classrooms, rosterEntries } from '$lib/server/db/schema';
import type { DbConnection } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'classrooms.queries';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export interface CreateClassroomArgs {
    ownerId: string;
    name: string;
    org: string;
    studentNames: string[];
}

/** Inserts the classroom and its whole roster in a single transaction. */
export async function createClassroomWithRoster(db: DbConnection, args: CreateClassroomArgs) {
    return await tracer.asyncSpan('create-classroom-with-roster', async (span) => {
        span.setAttributes({
            'user.id': args.ownerId,
            'classroom.name': args.name,
            'classroom.org': args.org,
            'classroom.roster_size': args.studentNames.length,
        });

        return await db.transaction(async (tx) => {
            const inserted = await tx
                .insert(classrooms)
                .values({ name: args.name, org: args.org, createdById: args.ownerId })
                .returning();
            const [classroom] = inserted;
            assert(typeof classroom !== 'undefined', 'classroom insert returned no row.');

            if (args.studentNames.length > 0)
                await tx
                    .insert(rosterEntries)
                    .values(args.studentNames.map((name) => ({ classroomId: classroom.id, name })));
            logger.info('classroom created', {
                'classroom.id': classroom.id,
                'classroom.roster_size': args.studentNames.length,
            });

            return classroom;
        });
    });
}

/**
 * Fetches a classroom with its roster for the owning teacher only; the
 * authorization predicate lives in the query itself. Returns `null` when the
 * classroom does not exist or belongs to someone else.
 */
export async function getClassroomForTeacher(
    db: DbConnection,
    classroomId: string,
    teacherId: string,
) {
    return await tracer.asyncSpan('get-classroom-for-teacher', async (span) => {
        span.setAttributes({ 'classroom.id': classroomId, 'user.id': teacherId });

        const rows = await db
            .select({ classroom: classrooms, rosterEntry: rosterEntries })
            .from(classrooms)
            .leftJoin(rosterEntries, eq(rosterEntries.classroomId, classrooms.id))
            .where(and(eq(classrooms.id, classroomId), eq(classrooms.createdById, teacherId)))
            .orderBy(rosterEntries.name);
        const [first] = rows;
        if (typeof first === 'undefined') return null;

        const students = rows.flatMap((row) => (row.rosterEntry === null ? [] : [row.rosterEntry]));
        return { classroom: first.classroom, students };
    });
}

/** Lists the classrooms a teacher created, newest first. */
export async function listOwnedClassrooms(db: DbConnection, ownerId: string) {
    return await tracer.asyncSpan('list-owned-classrooms', async (span) => {
        span.setAttribute('user.id', ownerId);

        return await db
            .select({
                id: classrooms.id,
                name: classrooms.name,
                org: classrooms.org,
                createdAt: classrooms.createdAt,
            })
            .from(classrooms)
            .where(eq(classrooms.createdById, ownerId))
            .orderBy(desc(classrooms.createdAt));
    });
}
