import {
    CollaboratorResponseSchema,
    GeneratedRepoSchema,
    GitCommitSchema,
    GitRefSchema,
    OrgReposSchema,
    PullRequestSchema,
    PullRequestsSchema,
} from './contracts';
import { githubApi } from './client';

export function listOrgRepos(token: string, org: string) {
    return githubApi(`/orgs/${encodeURIComponent(org)}/repos?per_page=100`, OrgReposSchema, {
        token,
    });
}

/**
 * Creates a repository from the given template repository, owned by `org`.
 * GitHub documents a single endpoint: `POST /repos/{template_owner}/{template_repo}/generate`
 * with the target org passed as the `owner` body parameter. Student repositories
 * are created private.
 */
export function createRepoFromTemplate(
    token: string,
    org: string,
    templateRepo: string,
    name: string,
) {
    return githubApi(
        `/repos/${encodeURIComponent(org)}/${encodeURIComponent(templateRepo)}/generate`,
        GeneratedRepoSchema,
        { method: 'POST', token, body: { owner: org, name, private: true } },
    );
}

/** Reads a branch ref under `refs/heads/`; the returned SHA seeds new branches. */
export function getBranchHead(token: string, owner: string, repo: string, branch: string) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`,
        GitRefSchema,
        { token },
    );
}

/** Creates `refs/heads/{ref}` at `sha` inside `owner/repo`. */
export function createBranch(token: string, owner: string, repo: string, ref: string, sha: string) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
        GitRefSchema,
        {
            method: 'POST',
            token,
            body: { ref: `refs/heads/${ref}`, sha },
        },
    );
}

/** Reads commit metadata needed to create an empty descendant commit. */
export function getCommit(token: string, owner: string, repo: string, sha: string) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`,
        GitCommitSchema,
        { token },
    );
}

/** Creates a commit using an existing tree and parent. */
export function createCommit(
    token: string,
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parent: string,
) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
        GitCommitSchema,
        { method: 'POST', token, body: { message, tree, parents: [parent] } },
    );
}

/** Moves an existing branch ref to a new commit. */
export function updateBranch(token: string, owner: string, repo: string, ref: string, sha: string) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(ref)}`,
        GitRefSchema,
        { method: 'PATCH', token, body: { sha, force: false } },
    );
}

/** Grants `username` the given permission (write = push) on `owner/repo`. */
export function addCollaborator(
    token: string,
    owner: string,
    repo: string,
    username: string,
    permission = 'push',
) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`,
        CollaboratorResponseSchema,
        { method: 'PUT', token, body: { permission } },
    );
}

/** Opens a pull request from `head` into `base` in `owner/repo`. */
export function createPullRequest(
    token: string,
    owner: string,
    repo: string,
    { head, base, title, body }: { head: string; base: string; title: string; body: string },
) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        PullRequestSchema,
        {
            method: 'POST',
            token,
            body: { title, head, base, body },
        },
    );
}

/** Lists open pull requests matching head and base branches. */
export function listOpenPullRequests(
    token: string,
    owner: string,
    repo: string,
    head: string,
    base: string,
) {
    const query = new URLSearchParams({
        state: 'open',
        head: `${owner}:${head}`,
        base,
        per_page: '100',
    });
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${query.toString()}`,
        PullRequestsSchema,
        { token },
    );
}
