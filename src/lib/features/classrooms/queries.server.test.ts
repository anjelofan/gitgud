import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

import {
    createClassroomWithRoster,
    getClassroomForTeacher,
    listOwnedClassrooms,
} from './queries.server.ts';

const TEACHER = { githubId: 201, login: 'classrooms-teacher', avatar_url: null };
const OTHER = { githubId: 202, login: 'classrooms-other', avatar_url: null };

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values([TEACHER, OTHER]);
});

async function teacherId(login: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (typeof row === 'undefined') throw new Error(`missing fixture user: ${login}`);
    return row.id;
}

describe('createClassroomWithRoster', () => {
    it('inserts the classroom and its roster entries', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const classroom = await createClassroomWithRoster(db, {
            ownerId,
            name: 'Algorithms',
            org: 'acme-edu',
            studentNames: ['Ada Lovelace', 'Grace Hopper'],
        });

        expect(classroom.name).toBe('Algorithms');
        expect(classroom.org).toBe('acme-edu');
        expect(classroom.createdById).toBe(ownerId);

        const stored = await getClassroomForTeacher(db, classroom.id, ownerId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Grace Hopper',
        ]);
    });

    it('accepts a classroom with no roster', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const classroom = await createClassroomWithRoster(db, {
            ownerId,
            name: 'Empty Roster',
            org: 'acme-edu',
            studentNames: [],
        });

        const stored = await getClassroomForTeacher(db, classroom.id, ownerId);
        expect(stored?.classroom.name).toBe('Empty Roster');
        expect(stored?.students).toEqual([]);
    });
});

describe('getClassroomForTeacher', () => {
    it('hides classrooms owned by other teachers', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const intruderId = await teacherId(OTHER.login);
        const classroom = await createClassroomWithRoster(db, {
            ownerId,
            name: 'Secret Seminar',
            org: 'acme-edu',
            studentNames: [],
        });

        expect(await getClassroomForTeacher(db, classroom.id, intruderId)).toBeNull();
    });

    it('returns null for a missing classroom id', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const missingId = '00000000-0000-0000-0000-000000000000';
        expect(await getClassroomForTeacher(db, missingId, ownerId)).toBeNull();
    });

    it('sorts roster entries alphabetically', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const classroom = await createClassroomWithRoster(db, {
            ownerId,
            name: 'Sorted',
            org: 'acme-edu',
            studentNames: ['Grace Hopper', 'Ada Lovelace', 'Alan Turing'],
        });

        const stored = await getClassroomForTeacher(db, classroom.id, ownerId);
        expect(stored?.students.map((entry) => entry.name)).toEqual([
            'Ada Lovelace',
            'Alan Turing',
            'Grace Hopper',
        ]);
    });
});

describe('listOwnedClassrooms', () => {
    it('lists only the classrooms the teacher created, newest first', async () => {
        const ownerId = await teacherId(TEACHER.login);
        const intruderId = await teacherId(OTHER.login);
        await createClassroomWithRoster(db, {
            ownerId,
            name: 'Older Classroom',
            org: 'acme-edu',
            studentNames: [],
        });
        await createClassroomWithRoster(db, {
            ownerId: intruderId,
            name: 'Not Mine',
            org: 'other-org',
            studentNames: [],
        });
        await createClassroomWithRoster(db, {
            ownerId,
            name: 'Newer Classroom',
            org: 'acme-edu',
            studentNames: [],
        });

        const listed = await listOwnedClassrooms(db, ownerId);
        expect(listed.map((entry) => entry.name)).toEqual(['Newer Classroom', 'Older Classroom']);
        expect(listed.map((entry) => entry.org)).toEqual(['acme-edu', 'acme-edu']);
    });
});
