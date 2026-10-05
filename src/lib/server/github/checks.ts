import { CheckRunAnnotationsSchema, CheckRunsSchema } from './contracts';
import { githubApi } from './client';

/**
 * Lists the check runs belonging to one check suite. A GitHub Actions workflow
 * run owns exactly one suite, so this is how a grading run's jobs — and the
 * annotations they carry — are reached from a webhook payload or a workflow run.
 */
export function listCheckSuiteCheckRuns(
    token: string,
    owner: string,
    repo: string,
    checkSuiteId: number,
) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-suites/${checkSuiteId}/check-runs`,
        CheckRunsSchema,
        { token },
    );
}

/** Reads the annotations GitHub attached to a single check run. */
export function listCheckRunAnnotations(
    token: string,
    owner: string,
    repo: string,
    checkRunId: number,
) {
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs/${checkRunId}/annotations`,
        CheckRunAnnotationsSchema,
        { token },
    );
}
