import * as v from 'valibot';

export const GithubUserSchema = v.object({
    id: v.number(),
    login: v.string(),
    avatar_url: v.nullable(v.string()),
});
export type GithubUser = v.InferOutput<typeof GithubUserSchema>;

export const OAuthTokenResponseSchema = v.object({
    access_token: v.string(),
    expires_in: v.number(),
    refresh_token: v.string(),
    refresh_token_expires_in: v.number(),
    token_type: v.literal('bearer'),
    scope: v.string(),
});
export type OAuthTokenResponse = v.InferOutput<typeof OAuthTokenResponseSchema>;

/** Single repository lookup; only the name is needed to confirm it exists in the org. */
export const OrgRepoSchema = v.object({ name: v.string() });
export type OrgRepo = v.InferOutput<typeof OrgRepoSchema>;

/** Repository created from a template; `default_branch` drives feedback-branch creation. */
export const GeneratedRepoSchema = v.object({
    name: v.string(),
    default_branch: v.string(),
});
export type GeneratedRepo = v.InferOutput<typeof GeneratedRepoSchema>;

export const GitRefSchema = v.object({
    ref: v.string(),
    object: v.object({ sha: v.string() }),
});
export type GitRef = v.InferOutput<typeof GitRefSchema>;

export const GitCommitSchema = v.object({
    sha: v.string(),
    message: v.string(),
    tree: v.object({ sha: v.string() }),
});
export type GitCommit = v.InferOutput<typeof GitCommitSchema>;

/** `PUT /collaborators` answers `201`/`204` with an empty body. */
export const CollaboratorResponseSchema = v.looseObject({});

/** Installation of the GitHub App on an org; `id` mints installation tokens. */
export const AppInstallationSchema = v.object({ id: v.number() });
export type AppInstallation = v.InferOutput<typeof AppInstallationSchema>;

export const InstallationTokenSchema = v.object({
    token: v.string(),
    expires_at: v.string(),
});
export type InstallationToken = v.InferOutput<typeof InstallationTokenSchema>;

export const PullRequestSchema = v.object({
    number: v.number(),
    html_url: v.string(),
});
export type PullRequest = v.InferOutput<typeof PullRequestSchema>;
export const PullRequestsSchema = v.array(PullRequestSchema);

/** One check run of a check suite; `annotations_count` gates the annotation read. */
export const CheckRunSchema = v.object({
    id: v.number(),
    output: v.object({ annotations_count: v.number() }),
});
export type CheckRun = v.InferOutput<typeof CheckRunSchema>;

export const CheckRunsSchema = v.object({ check_runs: v.array(CheckRunSchema) });

/** A check run annotation; the autograding marker lives in its `title` and `message`. */
export const CheckRunAnnotationSchema = v.object({
    title: v.nullable(v.string()),
    message: v.string(),
});
export type CheckRunAnnotation = v.InferOutput<typeof CheckRunAnnotationSchema>;

export const CheckRunAnnotationsSchema = v.array(CheckRunAnnotationSchema);

/** One workflow run; `check_suite_id` reaches the run's check runs and annotations. */
export const WorkflowRunSchema = v.object({
    id: v.number(),
    name: v.string(),
    check_suite_id: v.number(),
    head_sha: v.string(),
    conclusion: v.nullable(v.string()),
});
export type WorkflowRun = v.InferOutput<typeof WorkflowRunSchema>;

export const WorkflowRunsSchema = v.object({ workflow_runs: v.array(WorkflowRunSchema) });
