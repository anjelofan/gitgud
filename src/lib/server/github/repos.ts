import { githubApi } from './client';
import { OrgReposSchema } from './contracts';

export function listOrgRepos(token: string, org: string) {
    return githubApi(`/orgs/${encodeURIComponent(org)}/repos?per_page=100`, OrgReposSchema, {
        token,
    });
}
