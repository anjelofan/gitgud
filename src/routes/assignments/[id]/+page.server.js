import * as v from 'valibot'
import { error, redirect} from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';
import { getAssignmentForInstructor } from '$lib/features/assignments/queries.server.js';

const SERVICE_NAME = 'routes.assignments.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const AssignmentIdSchema = v.pipe(v.string(), v.uuid())

export async function load({ locals: {session}, params}) {
    return await tracer.asyncSpan('load-assignment-dashboard', async (span) => {
        if (session === null){
            logger.error('missing session, redirecting to sign-in');
            redirect(303, '/auth/sign-in');
        }
        span.setAttribute('user.id', session.user.id)

        const assignmentId = v.safeParse(AssignmentIdSchema, params.id)
        if (!assignmentId.success) {
            logger.fatal('malformed assignment id requested', new v.ValiError(assignmentId.issues), {
                'user.id': session.user.id,
            });
            error(404, 'assignment not found');
        }
        span.setAttribute('assignment.id', assignmentId.output)

        const result = await getAssignmentForInstructor(db, assignmentId.output, session.user.id)
        if (result === null){
            logger.fatal('assignment not found or not owned by the requester', void 0, {
                'user.id': session.user.id,
                'assignment.id': assignmentId.output,
            });
            error(404, 'assignment not found');
        }

        const {name, deadline, inviteToken, templateRepo, programId} = result.assignment
        const { name: programName, org } = result.program;
        return {
            assignment: {name, deadline, inviteToken, templateRepo},
            program: {name: programName, id: programId, org}
        }
    })
}