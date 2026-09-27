import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';

import { acceptAssignment } from '$lib/features/assignments/accept.server';
import { createAssignmentForProgram } from '$lib/features/assignments/queries.server';
import { createProgramWithRoster } from '$lib/features/programs/queries.server';
import { db } from '$lib/server/db';
import { fakeGithub } from '$tests/fake-github/client';
import { rosterEntries, submissions, users } from '$lib/server/db/schema';
const INSTRUCTOR = { githubId: 501, login: 'accept-instructor', avatar_url: null };
const STUDENT = { githubId: 502, login: 'accept-student', avatar_url: null };
const OTHER_STUDENT = { githubId: 503, login: 'accept-other-student', avatar_url: null };
beforeAll(async () => {
    await fakeGithub('registerInstallation', { org: 'accept-org', installationId: 1 });
    await fakeGithub('registerInstallation', { org: 'git-fail-org', installationId: 2 });
    await fakeGithub('registerInstallationError', { org: 'no-app-org', status: 404 });
    await fakeGithub('registerTemplate', {
        token: 'installation-token-1',
        org: 'accept-org',
        template: 'tpl-repo',
        repoName: 'fibonacci-accept-student',
        defaultBranch: 'main',
    });
    await fakeGithub('registerTemplateError', {
        token: 'installation-token-1',
        org: 'accept-org',
        template: 'taken-tpl',
        status: 422,
    });
    await fakeGithub('registerTemplateError', {
        token: 'installation-token-2',
        org: 'git-fail-org',
        template: 'tpl-repo',
        status: 500,
    });
    await fakeGithub('registerTemplateError', {
        token: 'installation-token-1',
        org: 'accept-org',
        template: 'ghost-tpl',
        status: 404,
    });
    await fakeGithub('registerBranchHead', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'fibonacci-accept-student',
        branch: 'main',
        sha: 'abc123',
    });
    await fakeGithub('registerBranchHead', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'taken-accept-student',
        branch: 'main',
        sha: 'def456',
    });
    await fakeGithub('registerBranch', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'fibonacci-accept-student',
        branch: 'feedback',
        sha: 'abc123',
    });
    await fakeGithub('registerBranch', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'taken-accept-student',
        branch: 'feedback',
        sha: 'def456',
    });
    await fakeGithub('registerCollaborator', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'fibonacci-accept-student',
        username: 'accept-student',
    });
    await fakeGithub('registerCollaborator', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'taken-accept-student',
        username: 'accept-student',
    });
    await fakeGithub('registerPullRequest', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'fibonacci-accept-student',
    });
    await fakeGithub('registerPullRequest', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'taken-accept-student',
    });
    await fakeGithub('registerTemplate', {
        token: 'installation-token-1',
        org: 'accept-org',
        template: 'collab-tpl',
        repoName: 'collab-accept-student',
        defaultBranch: 'main',
    });
    await fakeGithub('registerBranchHead', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'collab-accept-student',
        branch: 'main',
        sha: 'ghi789',
    });
    await fakeGithub('registerBranch', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'collab-accept-student',
        branch: 'feedback',
        sha: 'ghi789',
    });
    await fakeGithub('registerPullRequest', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'collab-accept-student',
    });
    await fakeGithub('registerCollaboratorError', {
        token: 'installation-token-1',
        owner: 'accept-org',
        repo: 'collab-accept-student',
        username: 'accept-student',
        status: 500,
    });
});
beforeEach(async () => {
    await db.execute(sql`TRUNCATE users CASCADE`);
    await db.insert(users).values([INSTRUCTOR, STUDENT, OTHER_STUDENT]);
});
function assertDefined<T>(value: T, message: string) {
    if (typeof value === 'undefined') throw new Error(message);
    return value;
}
async function fixtureUsers() {
    const rows = await db
        .select({ id: users.id, login: users.login })
        .from(users)
        .orderBy(users.githubId);
    const [instructor, student, other] = rows;
    return {
        instructor: assertDefined(instructor, 'fixture user instructor missing'),
        student: assertDefined(student, 'fixture user student missing'),
        other: assertDefined(other, 'fixture user other missing'),
    };
}
async function acceptedAssignment(options?: {
    org?: string;
    assignmentName?: string;
    templateRepo?: string;
}) {
    const { instructor } = await fixtureUsers();
    const program = await createProgramWithRoster(db, {
        creatorId: instructor.id,
        name: 'Accept Program',
        org: options?.org ?? 'accept-org',
        studentNames: ['Jane Doe'],
    });
    const assignment = await createAssignmentForProgram(db, {
        instructorId: instructor.id,
        programId: program.id,
        name: options?.assignmentName ?? 'Fibonacci',
        deadline: new Date('2026-09-15T18:00:00.000Z'),
        templateRepo: options?.templateRepo ?? 'tpl-repo',
    });
    if (assignment === null) throw new Error('assignment fixture missing');
    return { instructor, program, assignment };
}
function acceptArgs(args: {
    student: { id: string; login: string };
    assignment: { id: string; name: string; templateRepo: string; programId: string };
    org: string;
    rosterEntryName?: string;
}) {
    return {
        assignmentId: args.assignment.id,
        assignmentName: args.assignment.name,
        templateRepo: args.assignment.templateRepo,
        programId: args.assignment.programId,
        org: args.org,
        userId: args.student.id,
        userLogin: args.student.login,
        rosterEntryName: args.rosterEntryName,
    };
}
describe('acceptAssignment', () => {
    it('claims the roster entry, creates the repo, and records the submission', async () => {
        const { student } = await fixtureUsers();
        const { program, assignment } = await acceptedAssignment();
        const outcome = await acceptAssignment(
            db,
            await acceptArgs({
                student,
                assignment,
                org: 'accept-org',
                rosterEntryName: 'Jane Doe',
            }),
        );
        expect(outcome).toEqual({ status: 'accepted', repoName: 'fibonacci-accept-student' });
        const [entry] = await db
            .select({ id: rosterEntries.id, claimedUserId: rosterEntries.claimedUserId })
            .from(rosterEntries)
            .where(eq(rosterEntries.programId, program.id));
        expect(entry?.claimedUserId).toBe(student.id);
        const [submission] = await db.select().from(submissions);
        expect(submission?.assignmentId).toBe(assignment.id);
        expect(submission?.repoName).toBe('fibonacci-accept-student');
        expect(submission?.rosterEntryId).toBe(entry?.id);
    });
    it('returns already-accepted on a retry', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment();
        const args = await acceptArgs({
            student,
            assignment,
            org: 'accept-org',
            rosterEntryName: 'Jane Doe',
        });
        expect(await acceptAssignment(db, args)).toEqual({
            status: 'accepted',
            repoName: 'fibonacci-accept-student',
        });
        expect(await acceptAssignment(db, args)).toEqual({
            status: 'already-accepted',
            repoName: 'fibonacci-accept-student',
        });
    });
    it('accepts without a roster name when the user already claimed an entry', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment();
        expect(
            await acceptAssignment(
                db,
                await acceptArgs({
                    student,
                    assignment,
                    org: 'accept-org',
                    rosterEntryName: 'Jane Doe',
                }),
            ),
        ).toEqual({ status: 'accepted', repoName: 'fibonacci-accept-student' });
        expect(
            await acceptAssignment(
                db,
                await acceptArgs({ student, assignment, org: 'accept-org' }),
            ),
        ).toEqual({ status: 'already-accepted', repoName: 'fibonacci-accept-student' });
    });
    it('returns roster-name-required when an unclaimed user sends no name', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment();
        expect(
            await acceptAssignment(
                db,
                await acceptArgs({ student, assignment, org: 'accept-org' }),
            ),
        ).toEqual({ status: 'roster-name-required' });
    });
    it('returns entry-missing for an unknown roster name', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment();
        expect(
            await acceptAssignment(
                db,
                await acceptArgs({
                    student,
                    assignment,
                    org: 'accept-org',
                    rosterEntryName: 'Ghost Student',
                }),
            ),
        ).toEqual({ status: 'entry-missing' });
    });
    it('returns entry-claimed when another student already claimed the entry', async () => {
        const { student, other } = await fixtureUsers();
        const { program, assignment } = await acceptedAssignment();
        const [entry] = await db
            .select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(eq(rosterEntries.programId, program.id));
        if (typeof entry === 'undefined') throw new Error('roster entry fixture missing');
        await db
            .update(rosterEntries)
            .set({ claimedUserId: other.id, claimedAt: new Date() })
            .where(eq(rosterEntries.id, entry.id));
        expect(
            await acceptAssignment(
                db,
                await acceptArgs({
                    student,
                    assignment,
                    org: 'accept-org',
                    rosterEntryName: 'Jane Doe',
                }),
            ),
        ).toEqual({ status: 'entry-claimed' });
    });
    it('rejects a repo name collision with no recorded submission (422)', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment({
            assignmentName: 'Taken',
            templateRepo: 'taken-tpl',
        });
        const outcome = await acceptAssignment(
            db,
            await acceptArgs({
                student,
                assignment,
                org: 'accept-org',
                rosterEntryName: 'Jane Doe',
            }),
        );
        expect(outcome).toEqual({ status: 'github-unavailable' });
        expect(await db.select().from(submissions)).toEqual([]);
    });
    it('records the submission as soon as the repo is created, before later provisioning', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment({
            assignmentName: 'Collab',
            templateRepo: 'collab-tpl',
        });
        const outcome = await acceptAssignment(
            db,
            await acceptArgs({
                student,
                assignment,
                org: 'accept-org',
                rosterEntryName: 'Jane Doe',
            }),
        );
        expect(outcome).toEqual({ status: 'github-unavailable' });
        const [submission] = await db.select().from(submissions);
        expect(submission?.repoName).toBe('collab-accept-student');
    });
    it('returns template-missing when the template repository does not exist (404)', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment({ templateRepo: 'ghost-tpl' });
        expect(
            await acceptAssignment(
                db,
                acceptArgs({
                    student,
                    assignment,
                    org: 'accept-org',
                    rosterEntryName: 'Jane Doe',
                }),
            ),
        ).toEqual({ status: 'template-missing' });
    });
    it('returns github-unavailable when GitHub fails repo creation (500)', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment({ org: 'git-fail-org' });
        expect(
            await acceptAssignment(
                db,
                acceptArgs({
                    student,
                    assignment,
                    org: 'git-fail-org',
                    rosterEntryName: 'Jane Doe',
                }),
            ),
        ).toEqual({ status: 'github-unavailable' });
    });
    it('returns app-not-installed when the org has no app installation (404)', async () => {
        const { student } = await fixtureUsers();
        const { assignment } = await acceptedAssignment({ org: 'no-app-org' });

        expect(
            await acceptAssignment(
                db,
                acceptArgs({
                    student,
                    assignment,
                    org: 'no-app-org',
                    rosterEntryName: 'Jane Doe',
                }),
            ),
        ).toEqual({ status: 'app-not-installed' });
    });
});
