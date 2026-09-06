import * as v from 'valibot';
import { error, redirect } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { getClassroomForTeacher } from '$lib/features/classrooms/queries.server';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.classrooms.id';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const ClassroomIdSchema = v.pipe(v.string(), v.uuid());

export async function load({ locals: { session }, params }) {
    return await tracer.asyncSpan('load-classroom-dashboard', async (span) => {
        if (session === null) {
            logger.error('missing session, redirecting to sign-in');
            redirect(303, '/auth/sign-in');
        }
        span.setAttribute('user.id', session.user.id);

        const classroomId = v.safeParse(ClassroomIdSchema, params.id);
        if (!classroomId.success) {
            logger.fatal('malformed classroom id requested', new v.ValiError(classroomId.issues), {
                'user.id': session.user.id,
            });
            error(404, 'Classroom not found');
        }
        span.setAttribute('classroom.id', classroomId.output);

        const result = await getClassroomForTeacher(db, classroomId.output, session.user.id);
        if (result === null) {
            logger.fatal('classroom not found or not owned by the requester', void 0, {
                'user.id': session.user.id,
                'classroom.id': classroomId.output,
            });
            error(404, 'Classroom not found');
        }

        return {
            classroom: { name: result.classroom.name, org: result.classroom.org },
            students: result.students.map((entry) => ({ id: entry.id, name: entry.name })),
        };
    });
}
