import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { fakeGithub } from '$tests/fake-github/client';
import { programs, rosterEntries, users } from '$lib/server/db/schema';

import { resolveRole } from './roles';

const TOKEN = 'roles-access-token';
const INSTRUCTOR = { githubId: 401, login: 'roles-instructor', avatar_url: null };
const STUDENT = { githubId: 402, login: 'roles-student', avatar_url: null };

beforeAll(async () => {
    await fakeGithub('registerUser', { token: TOKEN });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'admin-org',
        state: 'active',
        role: 'admin',
    });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'member-org',
        state: 'active',
        role: 'member',
    });
    await fakeGithub('registerMembership', {
        token: TOKEN,
        org: 'pending-org',
        state: 'pending',
        role: 'admin',
    });
    await fakeGithub('registerMembershipError', {
        token: TOKEN,
        org: 'forbidden-org',
        status: 403,
    });
    await fakeGithub('registerMembershipError', { token: TOKEN, org: 'boom-org', status: 500 });
});

beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values([INSTRUCTOR, STUDENT]);
});

async function userId(login: string) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (typeof row === 'undefined') throw new Error(`missing fixture user: ${login}`);
    return row.id;
}

async function claimedRosterEntry(org: string) {
    const studentId = await userId(STUDENT.login);
    const [program] = await db
        .insert(programs)
        .values({ name: 'Roles Program', org, instructorId: await userId(INSTRUCTOR.login) })
        .returning();
    const [entry] = await db
        .insert(rosterEntries)
        .values({
            programId: program.id,
            name: 'Jane Doe',
            claimedUserId: studentId,
            claimedAt: new Date(),
        })
        .returning();
    return entry;
}

describe('resolveRole', () => {
    it('returns null when the token, user, or org is missing', async () => {
        expect(await resolveRole(db, null, 'user-id', 'admin-org')).toBeNull();
        expect(await resolveRole(db, TOKEN, 'user-id', null)).toBeNull();
        expect(await resolveRole(db, TOKEN, null, 'admin-org')).toBeNull();
    });

    it('grants the instructor role to an active org admin', async () => {
        const instructorId = await userId(INSTRUCTOR.login);
        expect(await resolveRole(db, TOKEN, instructorId, 'admin-org')).toEqual({
            kind: 'instructor',
            source: 'org-owner',
        });
    });

    it('does not grant any role to a plain org member without a claimed entry', async () => {
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'member-org')).toBeNull();
    });

    it('grants the student role to a claimed roster entry in the org', async () => {
        await claimedRosterEntry('member-org');
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'member-org')).toEqual({
            kind: 'student',
            source: 'roster-entry',
        });
    });

    it('grants the student role to an outside collaborator (404 membership)', async () => {
        await claimedRosterEntry('unknown-org');
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'unknown-org')).toEqual({
            kind: 'student',
            source: 'roster-entry',
        });
    });

    it('grants the student role despite a pending membership', async () => {
        await claimedRosterEntry('pending-org');
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'pending-org')).toEqual({
            kind: 'student',
            source: 'roster-entry',
        });
    });

    it('does not grant the student role for a claimed entry in another org', async () => {
        await claimedRosterEntry('other-org');
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'member-org')).toBeNull();
    });

    it('does not grant a role for a pending membership without a claim', async () => {
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'pending-org')).toBeNull();
    });

    it('returns null when the membership is not accessible (403), even with a claim', async () => {
        await claimedRosterEntry('forbidden-org');
        const studentId = await userId(STUDENT.login);
        expect(await resolveRole(db, TOKEN, studentId, 'forbidden-org')).toBeNull();
    });

    it('propagates unexpected GitHub failures', async () => {
        const studentId = await userId(STUDENT.login);
        await expect(resolveRole(db, TOKEN, studentId, 'boom-org')).rejects.toThrow(/500/u);
    });
});
