import { githubApi } from './client';
import { type OrgRepos, OrgReposSchema } from './contracts';

export function listOrgRepos(token: string, org: string): Promise<OrgRepos> {
    return githubApi(`/orgs/${encodeURIComponent(org)}/repos`, OrgReposSchema, { token });
}
