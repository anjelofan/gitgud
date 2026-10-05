import * as v from 'valibot';
import { error, fail, redirect } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { getAssignmentForInstructor } from '$lib/features/assignments/queries.server.js';
import { getOrgInstallationToken } from '$lib/server/github/app';
import { Logger } from '$lib/server/telemetry/logger';
import { refreshAssignmentScores } from '$lib/features/assignments/grading.server.js';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.assignments.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const AssignmentIdSchema = v.pipe(v.string(), v.uuid());

export async function load({ locals: { session }, params }) {
    return await tracer.asyncSpan('load-assignment-dashboard', async (span) => {
        if (session === null) {
            logger.error('missing session, redirecting to sign-in');
            redirect(303, '/auth/sign-in');
        }
        span.setAttribute('user.id', session.user.id);

        const assignmentId = v.safeParse(AssignmentIdSchema, params.id);
        if (!assignmentId.success) {
            logger.fatal(
                'malformed assignment id requested',
                new v.ValiError(assignmentId.issues),
                {
                    'user.id': session.user.id,
                },
            );
            error(404, 'assignment not found');
        }
        span.setAttribute('assignment.id', assignmentId.output);

        const result = await getAssignmentForInstructor(db, assignmentId.output, session.user.id);
        if (result === null) {
            logger.fatal('assignment not found or not owned by the requester', void 0, {
                'user.id': session.user.id,
                'assignment.id': assignmentId.output,
            });
            error(404, 'assignment not found');
        }

        const { name, deadline, inviteToken, templateRepo, programId } = result.assignment;
        const { name: programName, org } = result.program;
        return {
            assignment: { name, deadline, inviteToken, templateRepo },
            program: { name: programName, id: programId, org },
            students: result.students,
        };
    });
}

export const actions = {
    async 'refresh-scores'({ locals: { session }, params }) {
        return await tracer.asyncSpan('refresh-scores-action', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated score refresh attempt');
                return fail(401, {
                    refresh: { ok: false, message: 'You must be signed in.' },
                });
            }
            span.setAttribute('user.id', session.user.id);

            const assignmentId = v.safeParse(AssignmentIdSchema, params.id);
            if (!assignmentId.success) {
                logger.fatal(
                    'malformed assignment id in refresh action',
                    new v.ValiError(assignmentId.issues),
                    { 'user.id': session.user.id },
                );
                return fail(400, {
                    refresh: { ok: false, message: 'Malformed assignment id' },
                });
            }
            span.setAttribute('assignment.id', assignmentId.output);

            const result = await getAssignmentForInstructor(
                db,
                assignmentId.output,
                session.user.id,
            );
            if (result === null) {
                logger.fatal('instructor does not own the assignment to refresh', void 0, {
                    'user.id': session.user.id,
                    'assignment.id': assignmentId.output,
                });
                return fail(404, {
                    refresh: { ok: false, message: 'Assignment not found' },
                });
            }

            const { org } = result.program;
            const token = await getOrgInstallationToken(org);
            if (token === null) {
                logger.fatal('github app is not installed on the program organization', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                });
                return fail(502, {
                    refresh: {
                        ok: false,
                        message: `GitGud is not installed on the ${org} organization, so its scores cannot be read.`,
                    },
                });
            }

            const repos = result.students.flatMap((student) =>
                student.repoName === null ? [] : [student.repoName],
            );
            const refresh = await refreshAssignmentScores(db, { token, org, repos });
            logger.info('assignment scores refreshed', {
                'assignment.id': assignmentId.output,
                'github.org': org,
                'grading.repository_count': refresh.submitted,
                'grading.recorded': refresh.recorded,
                'grading.current': refresh.current,
                'grading.failed': refresh.failed,
            });

            return { refresh: { ok: true, ...refresh } };
        });
    },
};
