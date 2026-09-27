import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

import {
    addStudentsToProgram,
    createProgramWithRoster,
    getProgramForInstructor,
    listOwnedPrograms,
    removeRosterEntries,
    renameRosterEntry,
} from './queries.server.ts';
import { ROSTER_MAX_STUDENTS } from './contracts.ts';

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
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Algorithms',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace', 'Grace Hopper'],
        });

        expect(program.name).toBe('Algorithms');
        expect(program.org).toBe('acme-edu');
        expect(program.instructorId).toBe(creatorId);

        const stored = await getProgramForInstructor(db, program.id, creatorId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });

    it('accepts a program with no roster', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Empty Roster',
            org: 'acme-edu',
            studentNames: [],
        });

        const stored = await getProgramForInstructor(db, program.id, creatorId);
        expect(stored?.program.name).toBe('Empty Roster');
        expect(stored?.students).toEqual([]);
    });

    it('rolls back the program when a roster entry fails to insert', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        await expect(
            createProgramWithRoster(db, {
                creatorId,
                name: 'Doomed Program',
                org: 'acme-edu',
                studentNames: ['Ada Lovelace', 'Ada Lovelace'],
            }),
        ).rejects.toThrow();

        expect(await listOwnedPrograms(db, creatorId)).toEqual([]);
    });
});

describe('getProgramForInstructor', () => {
    it('hides programs owned by other instructors', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Secret Seminar',
            org: 'acme-edu',
            studentNames: [],
        });

        expect(await getProgramForInstructor(db, program.id, intruderId)).toBeNull();
    });

    it('returns null for a missing program id', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const missingId = '00000000-0000-0000-0000-000000000000';
        expect(await getProgramForInstructor(db, missingId, creatorId)).toBeNull();
    });

    it('sorts roster entries alphabetically', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Sorted',
            org: 'acme-edu',
            studentNames: ['Grace Hopper', 'Ada Lovelace', 'Alan Turing'],
        });

        const stored = await getProgramForInstructor(db, program.id, creatorId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Alan Turing',
            'Grace Hopper',
        ]);
    });
});

describe('addStudentsToProgram', () => {
    it('adds net-new names to an owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Growing',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });

        const result = await addStudentsToProgram(db, {
            programId: program.id,
            instructorId: creatorId,
            names: ['Ada Lovelace', 'Grace Hopper'],
        });
        expect(result).toEqual({ ok: true, added: 1 });

        const stored = await getProgramForInstructor(db, program.id, creatorId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });

    it('rejects adds that would exceed the roster cap', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Full',
            org: 'acme-edu',
            studentNames: Array.from({ length: ROSTER_MAX_STUDENTS }, (_, index) => `S${index}`),
        });

        const result = await addStudentsToProgram(db, {
            programId: program.id,
            instructorId: creatorId,
            names: ['One More'],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('capacity-exceeded');
    });

    it('returns no-new-names when every submitted name already exists', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Static',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });

        const result = await addStudentsToProgram(db, {
            programId: program.id,
            instructorId: creatorId,
            names: ['Ada Lovelace'],
        });
        expect(result).toEqual({ ok: false, error: { kind: 'no-new-names' } });
    });

    it('refuses programs owned by another instructor', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Protected',
            org: 'acme-edu',
            studentNames: [],
        });

        const result = await addStudentsToProgram(db, {
            programId: program.id,
            instructorId: intruderId,
            names: ['Grace Hopper'],
        });
        expect(result).toEqual({ ok: false, error: { kind: 'not-owner' } });
    });
});

describe('renameRosterEntry', () => {
    it('renames a roster entry on an owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Rename',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const [entry] = stored?.students ?? [];
        if (typeof entry === 'undefined') throw new Error('missing roster entry');

        const result = await renameRosterEntry(db, {
            programId: program.id,
            instructorId: creatorId,
            entryId: entry.id,
            name: 'Augusta Ada King',
        });
        expect(result).toEqual({ ok: true });

        const updated = await getProgramForInstructor(db, program.id, creatorId);
        expect(updated?.students.map((student) => student.name)).toEqual(['Augusta Ada King']);
    });

    it('rejects a rename to a name already on the roster', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Conflict',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace', 'Grace Hopper'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const entry = stored?.students.find((student) => student.name === 'Ada Lovelace');
        if (typeof entry === 'undefined') throw new Error('missing roster entry');

        const result = await renameRosterEntry(db, {
            programId: program.id,
            instructorId: creatorId,
            entryId: entry.id,
            name: 'Grace Hopper',
        });
        expect(result).toEqual({ ok: false, error: { kind: 'name-conflict' } });
    });

    it('refuses a rename from another instructor', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Protected Rename',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const [entry] = stored?.students ?? [];
        if (typeof entry === 'undefined') throw new Error('missing roster entry');

        const result = await renameRosterEntry(db, {
            programId: program.id,
            instructorId: intruderId,
            entryId: entry.id,
            name: 'Stolen Name',
        });
        expect(result).toEqual({ ok: false, error: { kind: 'not-owner' } });

        const unchanged = await getProgramForInstructor(db, program.id, creatorId);
        expect(unchanged?.students.map((student) => student.name)).toEqual(['Ada Lovelace']);
    });

    it('returns not-found when the entry is missing from an owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Missing Entry',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });

        const result = await renameRosterEntry(db, {
            programId: program.id,
            instructorId: creatorId,
            entryId: crypto.randomUUID(),
            name: 'Grace Hopper',
        });
        expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
    });
});

describe('removeRosterEntries', () => {
    it('removes one or many roster entries from an owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Shrink',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace', 'Grace Hopper', 'Alan Turing'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const ids =
            stored?.students
                .filter((student) => student.name !== 'Alan Turing')
                .map((student) => student.id) ?? [];

        const result = await removeRosterEntries(db, {
            programId: program.id,
            instructorId: creatorId,
            entryIds: ids,
        });
        expect(result).toEqual({ ok: true, removed: 2 });

        const remaining = await getProgramForInstructor(db, program.id, creatorId);
        expect(remaining?.students.map((student) => student.name)).toEqual(['Alan Turing']);
    });

    it('refuses removal when an entry id is not on the owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Guarded',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const [entry] = stored?.students ?? [];
        if (typeof entry === 'undefined') throw new Error('missing roster entry');

        const result = await removeRosterEntries(db, {
            programId: program.id,
            instructorId: intruderId,
            entryIds: [entry.id],
        });
        expect(result).toEqual({ ok: false, error: { kind: 'not-owner' } });
    });

    it('removes a student once when the same id is submitted twice', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Duplicate Remove',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });
        const stored = await getProgramForInstructor(db, program.id, creatorId);
        const [entry] = stored?.students ?? [];
        if (typeof entry === 'undefined') throw new Error('missing roster entry');

        const result = await removeRosterEntries(db, {
            programId: program.id,
            instructorId: creatorId,
            entryIds: [entry.id, entry.id],
        });
        expect(result).toEqual({ ok: true, removed: 1 });

        const remaining = await getProgramForInstructor(db, program.id, creatorId);
        expect(remaining?.students).toEqual([]);
    });

    it('returns not-found when an entry id is missing from an owned program', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId,
            name: 'Unknown Remove',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace'],
        });

        const result = await removeRosterEntries(db, {
            programId: program.id,
            instructorId: creatorId,
            entryIds: [crypto.randomUUID()],
        });
        expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });

        const stored = await getProgramForInstructor(db, program.id, creatorId);
        expect(stored?.students.map((student) => student.name)).toEqual(['Ada Lovelace']);
    });
});

describe('listOwnedPrograms', () => {
    it('lists only the programs the instructor created, newest first', async () => {
        const creatorId = await instructorId(INSTRUCTOR.login);
        const intruderId = await instructorId(OTHER.login);
        await createProgramWithRoster(db, {
            creatorId,
            name: 'Older Program',
            org: 'acme-edu',
            studentNames: [],
        });
        await createProgramWithRoster(db, {
            creatorId: intruderId,
            name: 'Not Mine',
            org: 'other-org',
            studentNames: [],
        });
        await createProgramWithRoster(db, {
            creatorId,
            name: 'Newer Program',
            org: 'acme-edu',
            studentNames: [],
        });

        const listed = await listOwnedPrograms(db, creatorId);
        expect(listed.map((entry) => entry.name)).toEqual(['Newer Program', 'Older Program']);
        expect(listed.map((entry) => entry.org)).toEqual(['acme-edu', 'acme-edu']);
    });
});
