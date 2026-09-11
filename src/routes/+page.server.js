import { db } from '$lib/server/db';
import { listOwnedPrograms } from '$lib/features/programs/queries.server';
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

        if (session === null) return { user: null, programs: [] };

        span.setAttribute('user.id', session.user.id);

        const { login, avatarUrl } = session.user;
        const programs = await listOwnedPrograms(db, session.user.id);
        span.setAttribute('program.count', programs.length);
        return { user: { login, avatarUrl }, programs };
    });
}
