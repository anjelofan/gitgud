import * as v from 'valibot';
import { fail, redirect } from '@sveltejs/kit';

import {
    CreateClassroomInputSchema,
    ROSTER_MAX_STUDENTS,
    StudentRosterSchema,
} from '$lib/features/classrooms/contracts';
import { createClassroomWithRoster } from '$lib/features/classrooms/queries.server';
import { db } from '$lib/server/db';
import { decodeCreateClassroomForm } from '$lib/features/classrooms/form.server';
import { Logger } from '$lib/server/telemetry/logger';
import { parseRoster } from '$lib/features/classrooms/roster';
import { resolveRole } from '$lib/server/auth/roles';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.classrooms.new';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export function load({ locals: { session } }) {
    return tracer.span('load-create-classroom', (span) => {
        if (session === null) {
            logger.error('missing session, redirecting to sign-in');
            redirect(303, '/auth/sign-in');
        }

        span.setAttribute('user.id', session.user.id);
        return {};
    });
}

export const actions = {
    async default({ locals: { session }, request }) {
        return await tracer.asyncSpan('create-classroom', async (span) => {
            if (session === null) {
                logger.fatal('unauthenticated classroom creation attempt');
                return fail(401, { message: 'You must be signed in.' });
            }
            span.setAttribute('user.id', session.user.id);

            const submitted = await decodeCreateClassroomForm(await request.formData());
            const parsed = v.safeParse(CreateClassroomInputSchema, submitted);
            if (!parsed.success) {
                logger.fatal('invalid classroom form input', new v.ValiError(parsed.issues), {
                    'user.id': session.user.id,
                });
                return fail(422, {
                    message: 'Check the highlighted fields.',
                    issues: parsed.issues.map((issue) => ({
                        path: v.getDotPath(issue) ?? 'form',
                        message: issue.message,
                    })),
                    data: { name: submitted.name, org: submitted.org },
                });
            }

            const students = parseRoster(parsed.output.roster);
            const roster = v.safeParse(StudentRosterSchema, students);
            if (!roster.success) {
                logger.fatal(
                    'parsed roster violates roster limits',
                    new v.ValiError(roster.issues),
                    {
                        'user.id': session.user.id,
                        'classroom.roster_size': students.length,
                    },
                );
                return fail(422, {
                    message: `Roster must contain at most ${ROSTER_MAX_STUDENTS} students.`,
                    issues: [],
                    data: { name: parsed.output.name, org: parsed.output.org },
                });
            }

            const { org } = parsed.output;
            const role = await resolveRole(session.githubToken, org);
            if (role?.kind !== 'teacher') {
                logger.fatal('creator is not an owner of the GitHub organization', void 0, {
                    'user.id': session.user.id,
                    'github.org': org,
                });
                return fail(403, {
                    message: `You must be an owner of the ${org} organization on GitHub to create a classroom in it.`,
                    issues: [],
                    data: { name: parsed.output.name, org },
                });
            }

            const classroom = await createClassroomWithRoster(db, {
                ownerId: session.user.id,
                name: parsed.output.name,
                org,
                studentNames: students,
            });
            span.setAttribute('classroom.id', classroom.id);
            logger.info('classroom created via form', {
                'classroom.id': classroom.id,
                'classroom.org': org,
                'classroom.roster_size': students.length,
            });

            redirect(303, `/classrooms/${classroom.id}`);
        });
    },
};
