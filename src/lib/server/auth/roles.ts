import { GithubApiError, githubApi } from '$lib/server/github/client';
import { Logger } from '$lib/server/telemetry/logger';

import { type OrgMembership, OrgMembershipSchema } from './contracts';

const SERVICE_NAME = 'auth.roles';
const logger = Logger.byName(SERVICE_NAME);

export type Role =
    { kind: 'instructor'; source: 'org-owner' } | { kind: 'student'; source: 'roster-entry' };

/**
 * Resolves the current user's role within a GitHub organization.
 * Returns `{ kind: 'instructor' }` when the token's user is an active owner of
 * `org`. An org `member` is not a student — student status requires a claimed
 * roster entry, which is not implemented yet, so this returns `null` for them.
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
        if (error instanceof GithubApiError)
            switch (error.status) {
                case 403:
                    logger.warn('organization membership not accessible', {
                        'github.org': org,
                        'github.response.status_code': error.status,
                    });
                    return null;
                case 404:
                    logger.debug('user is not a member of the organization', { 'github.org': org });
                    return null;
                default:
                    throw error;
            }

        throw error;
    }

    const { state, role } = membership;
    if (state === 'active' && role === 'admin') return { kind: 'instructor', source: 'org-owner' };

    // TODO: check if the member is in the student roster before granting the student role.
    return null;
}
