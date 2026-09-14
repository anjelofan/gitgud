import { githubApi } from './client';
import { OrgReposSchema, type OrgRepos } from './contracts';

export function listOrgRepos(token: string, org: string): Promise<OrgRepos> {
    return githubApi(`/orgs/${encodeURIComponent(org)}/repos`, OrgReposSchema, { token });
}