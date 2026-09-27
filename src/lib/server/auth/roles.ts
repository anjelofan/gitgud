import { and, eq } from 'drizzle-orm';

import type { DbConnection } from '$lib/server/db';
import { GithubApiError, githubApi } from '$lib/server/github/client';
import { Logger } from '$lib/server/telemetry/logger';
import { programs, rosterEntries } from '$lib/server/db/schema';

import { type OrgMembership, OrgMembershipSchema } from './contracts';

const SERVICE_NAME = 'auth.roles';
const logger = Logger.byName(SERVICE_NAME);

export type Role =
    { kind: 'instructor'; source: 'org-owner' } | { kind: 'student'; source: 'roster-entry' };

/**
 * Resolves the current user's role within a GitHub organization.
 * Returns `{ kind: 'instructor' }` when the token's user is an active owner of
 * `org`. Otherwise, when the app-database user `userId` has claimed a roster
 * entry in a program backed by `org`, returns
 * `{ kind: 'student', source: 'roster-entry' }` — students participate as
 * outside collaborators, not org members, so a claimed entry grants the role
 * even without an org membership.
 */
export async function resolveRole(
    db: DbConnection,
    token: string | null,
    userId: string | null,
    org: string | null,
) {
    if (token === null || org === null || userId === null) return null;

    let membership: OrgMembership | null;
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
                    membership = null;
                    break;
                default:
                    throw error;
            }
        else throw error;
    }

    if (membership !== null && membership.state === 'active' && membership.role === 'admin')
        return { kind: 'instructor', source: 'org-owner' };

    const [claimedEntry] = await db
        .select({ id: rosterEntries.id })
        .from(rosterEntries)
        .innerJoin(programs, eq(rosterEntries.programId, programs.id))
        .where(and(eq(programs.org, org), eq(rosterEntries.claimedUserId, userId)))
        .limit(1);

    if (typeof claimedEntry !== 'undefined') return { kind: 'student', source: 'roster-entry' };

    logger.debug('no claimed roster entry for the user in the organization', {
        'github.org': org,
    });
    return null;
}
