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

export const OrgReposSchema = v.array(v.object({ name: v.string() }));
export type OrgRepos = v.InferOutput<typeof OrgReposSchema>;
