import * as v from 'valibot';
import { error, fail, redirect} from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { getProgramForInstructor } from '$lib/features/programs/queries.server';
import { createAssignmentForProgram, listAssignmentsForProgram } from '$lib/features/assignments/queries.server.js';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { listOrgRepos } from '$lib/server/github/repos.js';
import { decodeCreateAssignmentForm } from '$lib/features/assignments/form.server.js';
import { CreateAssignmentInputSchema } from '$lib/features/assignments/contracts.js';
import { resolveRole } from '$lib/server/auth/roles';

const SERVICE_NAME = 'routes.programs.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const ProgramIdSchema = v.pipe(v.string(), v.uuid());
const EMPTY_ASSIGNMENT_DATA = { name: '', deadline: '', templateRepo: '' };


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

        const repositories = await (async () => {
            if (session.githubToken === null) return [];
            try {
                return (await listOrgRepos(session.githubToken, org)).map((repo) => repo.name);
            } catch {
                logger.warn('organization repositories not listed', { 'program.id': programId.output });
                return [];
            }
        })();
        const assignments = await listAssignmentsForProgram(db, programId.output)

        return {
            program: { name, org },
            students: result.students.map(({ id, name }) => ({ id, name })),
            assignments,
            repositories
        };
    });
}


export const actions = {
    async 'create-assignment'({locals: {session}, params, request }) {
        return await tracer.asyncSpan('create-assignment-action', async(span) => {
            if (session === null) {
                logger.fatal('unauthenticated assignment creation attempt');
                return fail(401, {
                    message: 'You must be signed in.',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA
                });
            }
            span.setAttribute('user.id', session.user.id) 

            const programId = v.safeParse(ProgramIdSchema, params.id)
            if (!programId.success){
                logger.fatal('malformed program id in action', new v.ValiError(programId.issues), {
                    'user.id': session.user.id
                });
                return fail(400, {
                    message: 'Malformed program id',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA
                })
            }

            const submitted = decodeCreateAssignmentForm(await request.formData())
            const parsed = v.safeParse(CreateAssignmentInputSchema, submitted)

            if (!parsed.success){
                logger.fatal('invalid assignment form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id
                });
                return fail(422, {
                    message: 'Check the highlighted fields.',
                    issues: parsed.issues.map((issue) => ({
                        path: v.getDotPath(issue) ?? 'form',
                        message: issue.message,
                    })),
                    data: {name: submitted.name, deadline: submitted.deadline, templateRepo: submitted.templateRepo},
                })
            }

            const owned = await getProgramForInstructor(db, programId.output, session.user.id)
            if (owned === null) {
                logger.fatal('instructor does not own the program', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId.output
                })
                return fail(403, {
                    message: `You must be the owner of ${programId.output} program to create an assignment in it`,
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA
                })
            }

            const org = owned.program.org
            const role = await resolveRole(session.githubToken, org)
            if (role?.kind !== 'instructor') {
                logger.fatal('creator is not an owner of the GitHub organization', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                });
                return fail(403, {
                    message: `You must be an owner of the ${org} organization on GitHub to create an assignment in it.`,
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });
            }

            const assignment = await createAssignmentForProgram(db, {
                instructorId: session.user.id,
                programId: programId.output,
                name: parsed.output.name,
                deadline: parsed.output.deadline,
                templateRepo: parsed.output.templateRepo
            })

            if (assignment === null){
                logger.fatal('assignment creation failed ownership re-check', void 0, {
                    'user.id': session.user.id,
                    'program.id': programId.output,
                });
                return fail(403, {
                    message: 'Program is not found or you do not own it',
                    issues: [],
                    data: EMPTY_ASSIGNMENT_DATA,
                });            
            }

            logger.info('assignment created via form', {
                'assignment.id': assignment.id,
                'assignment.name': assignment.name,
                'assignment.templateRepo': assignment.templateRepo
            })
            redirect(303, `/assignments/${assignment.id}`)

        })
    }
}