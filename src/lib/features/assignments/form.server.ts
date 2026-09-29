import { getOrgRepo } from '$lib/server/github/repos';
import { GithubApiError } from '$lib/server/github/client';

/** Decodes a single text form field; non-string values decode to the empty string. */
function stringField(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

/**
 * Representation-only decode of the create-assignment form; validation happens
 * at the action boundary through `CreateAssignmentInputSchema`.
 */
export function decodeCreateAssignmentForm(formData: FormData) {
    return {
        name: stringField(formData, 'name'),
        deadline: stringField(formData, 'deadline'),
        templateRepo: stringField(formData, 'templateRepo'),
    };
}

export type TemplateRepoStatus = 'known' | 'missing' | 'unavailable';

/**
 * Confirms the submitted template repository exists in the organization by
 * reading it directly; the free-text form field does not enforce org membership.
 * A 404 means the org does not expose the repo to this token; any other failure
 * is transient and reported as `unavailable` so the caller can ask for a retry.
 */
export async function templateRepoStatus(
    token: string | null,
    org: string,
    repo: string,
): Promise<TemplateRepoStatus> {
    if (token === null) return 'unavailable';
    try {
        await getOrgRepo(token, org, repo);
        return 'known';
    } catch (error) {
        if (error instanceof GithubApiError && error.status === 404) return 'missing';
        return 'unavailable';
    }
}
