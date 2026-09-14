import * as v from 'valibot';
import { error, fail, redirect, type Actions } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { getProgramForInstructor } from '$lib/features/programs/queries.server';
import { createAssignmentForProgram, listAssignmentsForProgram } from '$lib/features/assignments/queries.server.js';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { listOrgRepos } from '$lib/server/github/repos.js';

const SERVICE_NAME = 'routes.programs.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const ProgramIdSchema = v.pipe(v.string(), v.uuid());

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

        let repositories: string[] = [];
        if (session.githubToken !== null) {
            try{{
                repositories = (await listOrgRepos(session.githubToken, org)).map((repo) => repo.name)
            }}
            catch (error) {
                logger.warn('organization repositories not listed', {'program.id': programId.output})
            }
        }
        const assignments = await listAssignmentsForProgram(db, programId.output)

        return {
            program: { name, org },
            students: result.students.map(({ id, name }) => ({ id, name })),
            assignments,
            repositories
        };
    });
}


