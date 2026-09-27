import { and, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createProgramWithRoster } from '$lib/features/programs/queries.server';
import { db } from '$lib/server/db';
import { rosterEntries, submissions, users } from '$lib/server/db/schema';

import {
    createAssignmentForProgram,
    getAssignmentByInviteToken,
    getAssignmentForInstructor,
    getClaimedRosterEntry,
    listAssignmentsForProgram,
    listUnclaimedRosterEntries,
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
    it('returns every roster entry with matching submission data', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const [student] = await db
            .insert(users)
            .values({
                githubId: 203,
                login: 'student-cat',
                avatarUrl: 'https://avatars.example/student-cat.png',
            })
            .returning();
        if (typeof student === 'undefined') throw new Error('student fixture missing');

        const program = await createProgramWithRoster(db, {
            creatorId: ownerId,
            name: 'Dashboard Program',
            org: 'dashboard-org',
            studentNames: ['Alice', 'Bob'],
        });
        const assignment = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Dashboard Assignment',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dashboard-template',
        });
        expect(assignment).not.toBeNull();
        if (assignment === null) return;

        const [alice] = await db
            .select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(and(eq(rosterEntries.programId, program.id), eq(rosterEntries.name, 'Alice')));
        if (typeof alice === 'undefined') throw new Error('roster fixture missing');
        await db
            .update(rosterEntries)
            .set({ claimedUserId: student.id, claimedAt: new Date() })
            .where(eq(rosterEntries.id, alice.id));
        await db.insert(submissions).values({
            assignmentId: assignment.id,
            rosterEntryId: alice.id,
            repoName: 'dashboard-assignment-student-cat',
        });

        const stored = await getAssignmentForInstructor(db, assignment.id, ownerId);
        expect(stored).not.toBeNull();
        if (stored === null) return;

        expect(stored.students.sort((left, right) => left.name.localeCompare(right.name))).toEqual([
            {
                name: 'Alice',
                login: 'student-cat',
                avatarUrl: 'https://avatars.example/student-cat.png',
                repoName: 'dashboard-assignment-student-cat',
            },
            { name: 'Bob', login: null, avatarUrl: null, repoName: null },
        ]);
    });

    it('does not attach a submission from another assignment', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await createProgramWithRoster(db, {
            creatorId: ownerId,
            name: 'Assignment Filter Program',
            org: 'assignment-filter-org',
            studentNames: ['Alice'],
        });
        const first = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'First Assignment',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'template',
        });
        const second = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Second Assignment',
            deadline: new Date('2026-09-16T18:00:00.000Z'),
            templateRepo: 'template',
        });
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        if (first === null || second === null) return;

        const [entry] = await db
            .select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(eq(rosterEntries.programId, program.id));
        if (typeof entry === 'undefined') throw new Error('roster fixture missing');
        await db.insert(submissions).values({
            assignmentId: second.id,
            rosterEntryId: entry.id,
            repoName: 'second-assignment-repo',
        });

        const stored = await getAssignmentForInstructor(db, first.id, ownerId);
        expect(stored).not.toBeNull();
        if (stored === null) return;
        expect(stored.students).toEqual([
            { name: 'Alice', login: null, avatarUrl: null, repoName: null },
        ]);
    });

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

describe('getAssignmentByInviteToken', () => {
    it('returns the assignment and program context for a valid invite token', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const program = await ownedProgram(INSTRUCTOR.login, 'Invite Program', 'invite-org');

        const assignment = await createAssignmentForProgram(db, {
            instructorId: ownerId,
            programId: program.id,
            name: 'Invite Assignment',
            deadline: new Date('2026-09-15T18:00:00.000Z'),
            templateRepo: 'dtp2627a-0',
        });
        expect(assignment).not.toBeNull();
        if (assignment === null) return;

        const found = await getAssignmentByInviteToken(db, assignment.inviteToken);
        expect(found).not.toBeNull();
        if (found === null) return;

        expect(found.assignment.name).toBe('Invite Assignment');
        expect(found.program).toEqual({
            id: program.id,
            name: 'Invite Program',
            org: 'invite-org',
            instructorId: ownerId,
        });
    });

    it('returns null for an unknown invite token', async () => {
        expect(await getAssignmentByInviteToken(db, 'no-such-token')).toBeNull();
    });
});

describe('roster entry claim queries', () => {
    it('lists only unclaimed roster entries', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const studentId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId: ownerId,
            name: 'Claim Program',
            org: 'claim-org',
            studentNames: ['Alice', 'Bob', 'Carol'],
        });

        await db
            .update(rosterEntries)
            .set({ claimedUserId: studentId, claimedAt: new Date() })
            .where(and(eq(rosterEntries.programId, program.id), eq(rosterEntries.name, 'Alice')));

        const unclaimed = await listUnclaimedRosterEntries(db, program.id);
        expect(unclaimed.map((entry) => entry.name)).toEqual(['Bob', 'Carol']);
    });

    it('returns the claimed entry for a user', async () => {
        const ownerId = await instructorId(INSTRUCTOR.login);
        const studentId = await instructorId(OTHER.login);
        const program = await createProgramWithRoster(db, {
            creatorId: ownerId,
            name: 'Claim Program',
            org: 'claim-org',
            studentNames: ['Alice', 'Bob'],
        });

        await db
            .update(rosterEntries)
            .set({ claimedUserId: studentId, claimedAt: new Date() })
            .where(and(eq(rosterEntries.programId, program.id), eq(rosterEntries.name, 'Alice')));

        expect(await getClaimedRosterEntry(db, program.id, studentId)).toEqual({ name: 'Alice' });
        expect(await getClaimedRosterEntry(db, program.id, ownerId)).toBeNull();
    });
});
