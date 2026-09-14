import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { createProgramWithRoster } from '$lib/features/programs/queries.server';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';

import {
    createAssignmentForProgram,
    getAssignmentForInstructor,
    listAssignmentsForProgram,
} from './queries.server.ts';

const INSTRUCTOR = { githubId: 201, login: 'assignments-instructor', avatar_url: null };
const OTHER = { githubId: 202, login: 'assignments-other', avatar_url: null };

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values([INSTRUCTOR, OTHER]);
});

async function instructorId(login: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (typeof row === 'undefined') throw new Error(`missing fixture user: ${login}`);
    return row.id;
}

async function ownedProgram(login: string, name = 'DTP IP Notes', org = 'dtp-org') {
    const creatorId = await instructorId(login);
    return await createProgramWithRoster(db, { creatorId, name, org, studentNames: [] });
}

describe('createAssignmentForProgram', () => {
    it('creates an assignment for an owned program', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await ownedProgram(INSTRUCTOR.login);
        const deadline = new Date('2026-09-15T18:00:00.000Z');

        const assignment = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'DTP Assignment #0',
            deadline,
            templateRepo: 'dtp2627a-0',
        });
        expect(assignment).not.toBeNull();
        if (assignment === null) return;

        expect(assignment.programId).toBe(program.id);
        expect(assignment.name).toBe('DTP Assignment #0');
        expect(assignment.deadline.toISOString()).toBe(deadline.toISOString());
        expect(assignment.templateRepo).toBe('dtp2627a-0');
        expect(assignment.inviteToken.length).toBeGreaterThan(0);
    });

    it('returns null when the program belongs to another instructor', async () => {
        const intruderId = await instructorId(OTHER.login);
        const program = await ownedProgram(INSTRUCTOR.login);

        expect(
            await createAssignmentForProgram(db, {
                instructorId: intruderId,
                programId: program.id,
                name: 'Not DTP Assignment #0',
                deadline: new Date('2026-09-15T18:00:00.000Z'),
                templateRepo: 'dtp2627a-0',
            }),
        ).toBeNull();
    });

    it('returns null for a missing program id', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const missingId = '00000000-0000-0000-0000-000000000000';

        expect(
            await createAssignmentForProgram(db, {
                instructorId: ownerId,
                programId: missingId,
                name: 'Ghost Assignment',
                deadline: new Date('2026-09-15T18:00:00.000Z'),
                templateRepo: 'dtp2627a-0',
            }),
        ).toBeNull();
    });
});

describe('listAssignmentsForProgram', () => {
    it('lists assignments in descending deadline order', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await ownedProgram(INSTRUCTOR.login);

        await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Earlier Due',
            deadline: new Date('2026-01-01T00:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });
        await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Later Due',
            deadline: new Date('2027-01-01T00:00:00.000Z'),
            templateRepo: 'dtp2627a-1',
        });

        const listed = await listAssignmentsForProgram(db, program.id);
        expect(listed.map((entry) => entry.name)).toEqual(['Later Due', 'Earlier Due']);
    });

    it('only lists assignments for the given program', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const firstProgram = await ownedProgram(INSTRUCTOR.login, 'First Program');
        const secondProgram = await ownedProgram(INSTRUCTOR.login, 'Second Program');

        await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: firstProgram.id,
            name: 'Listed',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });
        await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: secondProgram.id,
            name: 'Not Listed',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });

        const listed = await listAssignmentsForProgram(db, firstProgram.id);
        expect(listed.map((entry) => entry.name)).toEqual(['Listed']);
    });
});

describe('getAssignmentForInstructor', () => {
    it('returns the assignment with program context for the owner', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await ownedProgram(INSTRUCTOR.login, 'DTP 2627a', 'dtp-org');

        const assignment = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'DTP Assignment #0',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });
        expect(assignment).not.toBeNull();
        if (assignment === null) return;

        const stored = await getAssignmentForInstructor(db, assignment.id, ownerId);
        expect(stored).not.toBeNull();
        if (stored === null) return;

        expect(stored.assignment.name).toBe('DTP Assignment #0');
        expect(stored.assignment.templateRepo).toBe('dtp2627a-0');
        expect(stored.program).toEqual({ name: 'DTP 2627a', org: 'dtp-org' });
    });

    it('returns null when another instructor owns the parent program', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const otherId = await instructorId(OTHER.login);
        const program = await ownedProgram(INSTRUCTOR.login);

        const assignment = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Not Owned',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });
        expect(assignment).not.toBeNull();
        if (assignment === null) return;

        expect(await getAssignmentForInstructor(db, assignment.id, otherId)).toBeNull();
    });

    it('returns null for a missing assignment id', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const missingId = '00000000-0000-0000-0000-000000000000';

        expect(await getAssignmentForInstructor(db, missingId, ownerId)).toBeNull();
    });
});