import { redirect } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { destroySession, SESSION_COOKIE } from '$lib/server/auth/sessions';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.auth.sign-out';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export async function POST({ cookies, locals }) {
    const { sessionId } = locals.session ?? { sessionId: null };
    return await tracer.asyncSpan('sign-out', async (span) => {
        if (sessionId === null) {
            logger.debug('sign-out requested without an active session');
        } else {
            span.setAttribute('session.id', sessionId);
            await destroySession(db, sessionId);
        }

        cookies.delete(SESSION_COOKIE, { path: '/' });
        redirect(303, '/');
    });
}
