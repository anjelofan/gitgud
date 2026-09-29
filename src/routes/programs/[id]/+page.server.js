import * as v from 'valibot';
import { error, fail, redirect } from '@sveltejs/kit';

import {
    AddRosterBatchInputSchema,
    AddStudentInputSchema,
    RemoveStudentsInputSchema,
    RenameStudentInputSchema,
    StudentRosterSchema,
} from '$lib/features/programs/contracts';
import {
    addStudentsToProgram,
    getProgramForInstructor,
    removeRosterEntries,
    renameRosterEntry,
} from '$lib/features/programs/queries.server';
import {
    createAssignmentForProgram,
    listAssignmentsForProgram,
} from '$lib/features/assignments/queries.server.js';
import { CreateAssignmentInputSchema } from '$lib/features/assignments/contracts.js';
import { db } from '$lib/server/db';
import {
    decodeAddRosterBatchForm,
    decodeAddStudentForm,
    decodeRemoveStudentsForm,
    decodeRenameStudentForm,
} from '$lib/features/programs/form.server';
import {
    decodeCreateAssignmentForm,
    templateRepoStatus,
} from '$lib/features/assignments/form.server.js';
import { Logger } from '$lib/server/telemetry/logger';
import { parseRoster } from '$lib/features/programs/roster';
import { resolve } from '$app/paths';
import { resolveRole } from '$lib/server/auth/roles';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.programs.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const ProgramIdSchema = v.pipe(v.string(), v.uuid());
const EMPTY_ASSIGNMENT_DATA = { name: '', deadline: '', templateRepo: '' };
const EMPTY_ROSTER_DATA = { addName: '', rosterText: '', renameEntryId: '', renameName: '' };

/** @param {number} status @param {Record<string, unknown>} payload */
function assignmentFail(status, payload) {
    return fail(status, { scope: 'assignment', ...payload });
}

/** @param {number} status @param {Record<string, unknown>} payload */
function rosterFail(status, payload) {
    return fail(status, { scope: 'roster', ...payload });
}

/** @param {import('valibot').BaseIssue<unknown>[]} issues */
function mapValidationIssues(issues) {
    return issues.map((issue) => ({
        path: v.getDotPath(issue) ?? 'form',
        message: issue.message,
    }));
}

/** @param {string} kind */
function rosterMutationStatus(kind) {
    if (kind === 'not-owner') return 403;
    if (kind === 'not-found') return 404;
    return 422;
}

/** @param {import('$lib/features/programs/contracts').Roster | null} roster */
function pastedRosterText(roster) {
    if (roster === null) return '';
    if (roster.format === 'text') return roster.content;
    return '';
}

/** @param {{ kind: string; message?: string }} error */
function rosterMutationMessage(error) {
    switch (error.kind) {
        case 'not-owner':
            return 'You must be the owner of this program to edit its roster.';
        case 'not-found':
            return 'Student or program not found.';
        case 'name-conflict':
            return 'That name is already on the roster.';
        case 'no-new-names':
            return 'Every submitted name is already on the roster.';
        case 'capacity-exceeded':
            return error.message;
        default:
            throw new Error('unknown roster mutation error');
    }
}

/** @param {{ id: string }} params @param {string} userId */
function parseProgramId(params, userId) {
    const programId = v.safeParse(ProgramIdSchema, params.id);
    if (programId.success) return programId.output;
    logger.fatal('malformed program id in action', new v.ValiError(programId.issues), {
        'user.id': userId,
    });
    return null;
}

export async function load({ locals: { session }, params }) {
    return await tracer.asyncSpan('load-program-dashboard', async (span) => {
        if (session === null) {
            logger.error('missing session, redirecting to sign-in');
            redirect(303, '/auth/sign-in');
        }
        span.setAttribute('user.id', session.user.id);

        const programId = v.safeParse(ProgramIdSchema, params.id);
        if (!programId.success) {
            logger.fatal('malformed program id requested', new v.ValiError(programId.issues), {
                'user.id': session.user.id,
            });
            error(404, 'Program not found');
        }
        span.setAttribute('program.id', programId.output);

        const result = await getProgramForInstructor(db, programId.output, session.user.id);
        if (result === null) {
            logger.fatal('program not found or not owned by the requester', void 0, {
                'user.id': session.user.id,
                'program.id': programId.output,
            });
            error(404, 'Program not found');
        }

        const { name, org } = result.program;

        const assignments = await listAssignmentsForProgram(db, programId.output);

        return {
            program: { name, org },
            students: result.students.map(({ id, name }) => ({ id, name })),
            assignments,
        };
    });
}

export const actions = {
    async 'create-assignment'({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('create-assignment-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated assignment creation attempt');
                return assignmentFail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }
            span.setAttribute('user.id', session.user.id);

            const programId = v.safeParse(ProgramIdSchema, params.id);
            if (!programId.success) {
                logger.fatal('malformed program id in action', new v.ValiError(programId.issues), {
                    'user.id': session.user.id,
                });
                return assignmentFail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            const submitted = decodeCreateAssignmentForm(await request.formData());
            const parsed = v.safeParse(CreateAssignmentInputSchema, submitted);

            if (!parsed.success) {
                logger.fatal('invalid assignment form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return assignmentFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: mapValidationIssues(parsed.issues),
                    data: submitted,
                });
            }

            const owned = await getProgramForInstructor(db, programId.output, session.user.id);
            if (owned === null) {
                logger.fatal('instructor does not own the program', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId.output,
                });
                return assignmentFail(403, {
                    message: `You must be the owner of ${programId.output} program to create an assignment in it`,
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            const { org } = owned.program;
            const role = await resolveRole(db, session.githubToken, session.user.id, org);
            if (role?.kind !== 'instructor') {
                logger.fatal('creator is not an owner of the GitHub organization', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                });
                return assignmentFail(403, {
                    message: `You must be an owner of the ${org} organization on GitHub to create an assignment in it.`,
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            const repoStatus = await templateRepoStatus(
                session.githubToken,
                org,
                parsed.output.templateRepo,
            );

            if (repoStatus === 'unavailable') {
                logger.fatal('template repository lookup failed', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                });
                return assignmentFail(502, {
                    message:
                        'Template repositories could not be reached on GitHub. Try again later.',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            if (repoStatus === 'missing') {
                logger.fatal('submitted template repository is not in the organization', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                    'assignment.templateRepo': parsed.output.templateRepo,
                });
                return assignmentFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: [
                        {
                            path: 'templateRepo',
                            message:
                                'Repository template must be a repository in the program organization.',
                        },
                    ],
                    data: submitted,
                });
            }

            const assignment = await createAssignmentForProgram(db, {
                instructorId: session.user.id,
                programId: programId.output,
                ...parsed.output,
            });

            if (assignment === null) {
                logger.fatal('assignment creation failed ownership re-check', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId.output,
                });
                return assignmentFail(403, {
                    message: 'Program is not found or you do not own it',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            logger.info('assignment created via form', {
                'assignment.id': assignment.id,
                'assignment.name': assignment.name,
                'assignment.templateRepo': assignment.templateRepo,
            });
            redirect(303, resolve('/assignments/[id]', { id: assignment.id }));
        });
    },

    async 'add-student'({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('add-student-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated roster add attempt');
                return rosterFail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });
            }
            span.setAttribute('user.id', session.user.id);

            const programId = parseProgramId(params, session.user.id);
            if (programId === null)
                return rosterFail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });

            const submitted = decodeAddStudentForm(await request.formData());
            const parsed = v.safeParse(AddStudentInputSchema, submitted);
            if (!parsed.success) {
                logger.fatal('invalid add-student form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return rosterFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: mapValidationIssues(parsed.issues),
                    data: { ...EMPTY_ROSTER_DATA, addName: submitted.name },
                });
            }

            const result = await addStudentsToProgram(db, {
                programId,
                instructorId: session.user.id,
                names: [parsed.output.name],
            });
            if (!result.ok) {
                logger.fatal('add student failed', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId,
                    'roster.error': result.error.kind,
                });
                return rosterFail(rosterMutationStatus(result.error.kind), {
                    message: rosterMutationMessage(result.error),
                    issues: [],
                    data: { ...EMPTY_ROSTER_DATA, addName: submitted.name },
                });
            }

            redirect(303, resolve('/programs/[id]', { id: programId }));
        });
    },

    async 'add-roster'({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('add-roster-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated roster batch add attempt');
                return rosterFail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });
            }
            span.setAttribute('user.id', session.user.id);

            const programId = parseProgramId(params, session.user.id);
            if (programId === null)
                return rosterFail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });

            const submitted = await decodeAddRosterBatchForm(await request.formData());
            const parsed = v.safeParse(AddRosterBatchInputSchema, submitted);
            if (!parsed.success) {
                logger.fatal('invalid add-roster form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return rosterFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: mapValidationIssues(parsed.issues),
                    data: { ...EMPTY_ROSTER_DATA, rosterText: submitted.rosterText ?? '' },
                });
            }

            const students = parseRoster(parsed.output.roster);
            if (students.length === 0) {
                logger.fatal('add-roster submitted without roster content', void 0, {
                    'user.id': session.user.id,
                });
                return rosterFail(422, {
                    message: 'Provide student names to add.',
                    issues: [
                        { path: 'rosterText', message: 'Upload a CSV or paste student names.' },
                    ],
                    data: EMPTY_ROSTER_DATA,
                });
            }

            const roster = v.safeParse(StudentRosterSchema, students);
            if (!roster.success) {
                logger.fatal(
                    'parsed roster violates roster limits',
                    new v.ValiError(roster.issues),
                    {
                        'user.id': session.user.id,
                        'program.roster_size': students.length,
                    },
                );
                const issues = mapValidationIssues(roster.issues);
                const [firstIssue] = issues;
                return rosterFail(422, {
                    message:
                        typeof firstIssue === 'undefined'
                            ? 'Check the highlighted fields.'
                            : firstIssue.message,
                    issues,
                    data: {
                        ...EMPTY_ROSTER_DATA,
                        rosterText: pastedRosterText(parsed.output.roster),
                    },
                });
            }

            const result = await addStudentsToProgram(db, {
                programId,
                instructorId: session.user.id,
                names: roster.output,
            });
            if (!result.ok) {
                logger.fatal('add roster batch failed', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId,
                    'roster.error': result.error.kind,
                });
                return rosterFail(rosterMutationStatus(result.error.kind), {
                    message: rosterMutationMessage(result.error),
                    issues: [],
                    data: {
                        ...EMPTY_ROSTER_DATA,
                        rosterText: pastedRosterText(parsed.output.roster),
                    },
                });
            }

            redirect(303, resolve('/programs/[id]', { id: programId }));
        });
    },

    async 'rename-student'({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('rename-student-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated roster rename attempt');
                return rosterFail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });
            }
            span.setAttribute('user.id', session.user.id);

            const programId = parseProgramId(params, session.user.id);
            if (programId === null)
                return rosterFail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });

            const submitted = decodeRenameStudentForm(await request.formData());
            const parsed = v.safeParse(RenameStudentInputSchema, submitted);
            if (!parsed.success) {
                logger.fatal('invalid rename-student form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return rosterFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: mapValidationIssues(parsed.issues),
                    data: {
                        ...EMPTY_ROSTER_DATA,
                        renameEntryId: submitted.entryId,
                        renameName: submitted.name,
                    },
                });
            }

            const result = await renameRosterEntry(db, {
                programId,
                instructorId: session.user.id,
                entryId: parsed.output.entryId,
                name: parsed.output.name,
            });
            if (!result.ok) {
                logger.fatal('rename student failed', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId,
                    'roster.error': result.error.kind,
                });
                return rosterFail(rosterMutationStatus(result.error.kind), {
                    message: rosterMutationMessage(result.error),
                    issues: [],
                    data: {
                        ...EMPTY_ROSTER_DATA,
                        renameEntryId: parsed.output.entryId,
                        renameName: parsed.output.name,
                    },
                });
            }

            redirect(303, resolve('/programs/[id]', { id: programId }));
        });
    },

    async 'remove-students'({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('remove-students-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated roster remove attempt');
                return rosterFail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });
            }
            span.setAttribute('user.id', session.user.id);

            const programId = parseProgramId(params, session.user.id);
            if (programId === null)
                return rosterFail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });

            const submitted = decodeRemoveStudentsForm(await request.formData());
            const parsed = v.safeParse(RemoveStudentsInputSchema, submitted);
            if (!parsed.success) {
                logger.fatal('invalid remove-students form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return rosterFail(422, {
                    message: 'Check the highlighted fields.',
                    issues: mapValidationIssues(parsed.issues),
                    data: EMPTY_ROSTER_DATA,
                });
            }

            const result = await removeRosterEntries(db, {
                programId,
                instructorId: session.user.id,
                entryIds: parsed.output.entryIds,
            });
            if (!result.ok) {
                logger.fatal('remove students failed', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId,
                    'roster.error': result.error.kind,
                });
                return rosterFail(rosterMutationStatus(result.error.kind), {
                    message: rosterMutationMessage(result.error),
                    issues: [],
                    data: EMPTY_ROSTER_DATA,
                });
            }

            redirect(303, resolve('/programs/[id]', { id: programId }));
        });
    },
};
