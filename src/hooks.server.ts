import { db } from '$lib/server/db';
import { getUserAccessToken, SESSION_COOKIE, validateSession } from '$lib/server/auth/sessions';

export async function handle({ event, resolve }) {
    const { cookies, getClientAddress, request } = event;
    const { logger, tracer } = await import('./hooks.telemetry');

    return await tracer.asyncSpan('http-request', async (span) => {
        let clientAddress: string | undefined;
        try {
            clientAddress = getClientAddress();
        } catch (error) {
            if (error instanceof Error) logger.error('failed to get client address', error);
            else throw error;
        }

        span.setAttributes({
            'http.request.id': crypto.randomUUID(),
            'http.request.method': request.method,
            'http.request.url': request.url,
            'network.client.address': clientAddress,
        });

        const sessionCookie = cookies.get(SESSION_COOKIE);
        const session =
            typeof sessionCookie === 'string' ? await validateSession(db, sessionCookie) : null;

        if (session === null) {
            event.locals.session = null;
        } else {
            const { id: userId, login, avatarUrl } = session.user;

            let githubToken: string | null = null;
            try {
                githubToken = await getUserAccessToken(db, userId);
            } catch (refreshError) {
                const cause =
                    refreshError instanceof Error ? refreshError : new Error(String(refreshError));
                logger.error('github token refresh failed; continuing without token', cause, {
                    'user.id': userId,
                });
            }

            event.locals.session = {
                sessionId: session.id,
                user: { id: userId, login, avatarUrl },
                githubToken,
            };

            span.setAttribute('session.id', session.id);
        }

        const realIp = request.headers.get('X-Real-IP');
        if (realIp !== null) span.setAttribute('network.client.real_ip', realIp);

        const forwardedFor = request.headers.get('X-Forwarded-For');
        if (forwardedFor !== null) span.setAttribute('network.client.forwarded_for', forwardedFor);

        logger.trace('resolving request...');

        return await resolve(event);
    });
}
export async function handleError({ error }) {
    const { Logger } = await import('$lib/server/telemetry/logger');
    const logger = Logger.byName('hooks.handleError');
    if (error instanceof Error) logger.fatal(error.message, error);
    else logger.fatal(String(error));
}
