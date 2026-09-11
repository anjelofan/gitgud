import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

import {
    createProgramWithRoster,
    getProgramForInstructor,
    listOwnedPrograms,
} from './queries.server.ts';

const INSTRUCTOR = { githubId: 201, login: 'programs-instructor', avatar_url: null };
const OTHER = { githubId: 202, login: 'programs-other', avatar_url: null };

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values([INSTRUCTOR, OTHER]);
});

async function instructorId(login: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (typeof row === 'undefined') throw new Error(`missing fixture user: ${login}`);
    return row.id;
}

describe('createProgramWithRoster', () => {
    it('inserts the program and its roster entries', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            ownerId,
            name: 'Algorithms',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace', 'Grace Hopper'],
        });

        expect(program.name).toBe('Algorithms');
        expect(program.org).toBe('acme-edu');
        expect(program.createdById).toBe(ownerId);

        const stored = await getProgramForInstructor(db, program.id, ownerId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });

    it('accepts a program with no roster', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            ownerId,
            name: 'Empty Roster',
            org: 'acme-edu',
            studentNames: [],
        });

        const stored = await getProgramForInstructor(db, program.id, ownerId);
        expect(stored?.program.name).toBe('Empty Roster');
        expect(stored?.students).toEqual([]);
    });

    it('rolls back the program when a roster entry fails to insert', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        await expect(
            createProgramWithRoster(db, {
                ownerId,
                name: 'Doomed Program',
                org: 'acme-edu',
                studentNames: ['Ada Lovelace', 'Ada Lovelace'],
            }),
        ).rejects.toThrow();

        expect(await listOwnedPrograms(db, ownerId)).toEqual([]);
    });
});

describe('getProgramForInstructor', () => {
    it('hides programs owned by other instructors', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            ownerId,
            name: 'Secret Seminar',
            org: 'acme-edu',
            studentNames: [],
        });

        expect(await getProgramForInstructor(db, program.id, intruderId)).toBeNull();
    });

    it('returns null for a missing program id', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const missingId = '00000000-0000-0000-0000-000000000000';
        expect(await getProgramForInstructor(db, missingId, ownerId)).toBeNull();
    });

    it('sorts roster entries alphabetically', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            ownerId,
            name: 'Sorted',
            org: 'acme-edu',
            studentNames: ['Grace Hopper', 'Ada Lovelace', 'Alan Turing'],
        });

        const stored = await getProgramForInstructor(db, program.id, ownerId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Alan Turing',
            'Grace Hopper',
        ]);
    });
});

describe('listOwnedPrograms', () => {
    it('lists only the programs the instructor created, newest first', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        await createProgramWithRoster(db, {
            ownerId,
            name: 'Older Program',
            org: 'acme-edu',
            studentNames: [],
        });
        await createProgramWithRoster(db, {
            ownerId: intruderId,
            name: 'Not Mine',
            org: 'other-org',
            studentNames: [],
        });
        await createProgramWithRoster(db, {
            ownerId,
            name: 'Newer Program',
            org: 'acme-edu',
            studentNames: [],
        });

        const listed = await listOwnedPrograms(db, ownerId);
        expect(listed.map((entry) => entry.name)).toEqual(['Newer Program', 'Older Program']);
        expect(listed.map((entry) => entry.org)).toEqual(['acme-edu', 'acme-edu']);
    });
});
