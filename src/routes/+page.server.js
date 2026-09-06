import { db } from '$lib/server/db';
import { listOwnedClassrooms } from '$lib/features/classrooms/queries.server';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.home';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export async function load({ locals: { session } }) {
    return await tracer.asyncSpan('load-home', async (span) => {
        logger.debug('home page loaded', {
            'user.authenticated': session !== null,
        });

        if (session === null) return { user: null, classrooms: [] };

        span.setAttribute('user.id', session.user.id);

        const { login, avatarUrl } = session.user;
        const classrooms = await listOwnedClassrooms(db, session.user.id);
        span.setAttribute('classroom.count', classrooms.length);
        return { user: { login, avatarUrl }, classrooms };
    });
}
