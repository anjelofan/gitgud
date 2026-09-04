import { env } from '$env/dynamic/private';

import { Logger } from '$lib/server/telemetry/logger';
import { resolveRole } from '$lib/server/auth/roles';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.home';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

export async function load({ locals: { session } }) {
    return await tracer.asyncSpan('load-home', async (span) => {
        logger.debug('home page loaded', {
            'user.authenticated': session !== null,
        });

        if (session === null) return { user: null, role: null };

        span.setAttribute('user.id', session.user.id);

        const role = await resolveRole(session.githubToken, env.GITHUB_ORG || null);
        if (role !== null) span.setAttribute('user.role', role.kind);

        const { login, avatarUrl } = session.user;
        return { user: { login, avatarUrl }, role: role === null ? null : { kind: role.kind } };
    });
}
