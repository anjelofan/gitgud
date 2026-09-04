import { GithubApiError, githubApi } from '$lib/server/github/client';
import { Logger } from '$lib/server/telemetry/logger';

import { type OrgMembership, OrgMembershipSchema } from './contracts';

const SERVICE_NAME = 'auth.roles';
const logger = Logger.byName(SERVICE_NAME);

export type Role =
    { kind: 'teacher'; source: 'org-owner' } | { kind: 'student'; source: 'roster-entry' };

/**
 * Resolves a role for the current request context.
 * Returns `null` until classroom (org) and roster features supply the context
 * needed for teacher/student resolution; an org `member` is not a student —
 * student status requires a claimed roster entry, which is not implemented yet.
 */
export async function resolveRole(token: string | null, org: string | null): Promise<Role | null> {
    if (token === null || org === null) return null;

    let membership: OrgMembership;
    try {
        membership = await githubApi(
            `/user/memberships/orgs/${encodeURIComponent(org)}`,
            OrgMembershipSchema,
            { token },
        );
    } catch (error) {
        if (error instanceof GithubApiError && error.status === 404) {
            logger.debug('user is not a member of the organization', { 'github.org': org });
            return null;
        }

        // The app may lack the organization members permission; role resolution
        // is best-effort context and must not take down the request.
        if (error instanceof GithubApiError && error.status === 403) {
            logger.warn('organization membership not accessible', {
                'github.org': org,
                'github.response.status_code': error.status,
            });
            return null;
        }

        throw error;
    }

    const { state, role } = membership;
    if (state === 'active' && role === 'admin') return { kind: 'teacher', source: 'org-owner' };

    // TODO: check if the member is in the student roster before granting the student role.
    return null;
}
