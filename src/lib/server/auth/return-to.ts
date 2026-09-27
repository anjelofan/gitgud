import * as v from 'valibot';

export const RETURN_TO_COOKIE = 'auth_return_to';

/** Post-sign-in redirect target: a local path only, never an absolute or protocol-relative URL. */
export const ReturnToSchema = v.pipe(
    v.string(),
    v.maxLength(512),
    v.regex(/^\/(?!\/)\S*$/u, 'Redirect target must be a local path.'),
);
