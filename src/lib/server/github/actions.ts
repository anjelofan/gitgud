import { githubApi } from './client';
import { WorkflowRunsSchema } from './contracts';

/** Enough history to walk past a student's non-grading workflows without paging. */
const COMPLETED_RUNS_PAGE_SIZE = 10;

/**
 * Lists a repository's most recently completed workflow runs. GitHub answers
 * newest first; callers that need a definite order sort by `id`, which grows
 * monotonically within a repository. Filtering on `completed` keeps runs that
 * have not concluded out of the result, so a null conclusion never reaches the
 * score walk-back.
 */
export function listCompletedWorkflowRuns(
    token: string,
    owner: string,
    repo: string,
    perPage = COMPLETED_RUNS_PAGE_SIZE,
) {
    const query = new URLSearchParams({ status: 'completed', per_page: String(perPage) });
    return githubApi(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${query.toString()}`,
        WorkflowRunsSchema,
        { token },
    );
}
