import * as v from 'valibot';
import { error, fail, redirect } from '@sveltejs/kit';

import { acceptAssignment } from '$lib/features/assignments/accept.server.js';
import { db } from '$lib/server/db';
import { dev } from '$app/environment';
import {
    getAcceptedSubmissionForUser,
    getAssignmentByInviteToken,
    getClaimedRosterEntry,
    listUnclaimedRosterEntries,
} from '$lib/features/assignments/queries.server.js';
import { InviteTokenSchema, RosterEntryNameSchema } from '$lib/features/assignments/contracts';
import { Logger } from '$lib/server/telemetry/logger';
import { RETURN_TO_COOKIE } from '$lib/server/auth/return-to';
import { Tracer } from '$lib/server/telemetry/tracer';

const SERVICE_NAME = 'routes.invite.token';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const RETURN_TO_MAX_AGE_SECONDS = 600;

export async function load({ cookies, locals: { session }, params }) {
    return await tracer.asyncSpan('load-invite', async (span) => {
        const token = v.safeParse(InviteTokenSchema, params.token);
        if (!token.success) {
            logger.fatal('malformed invitation token requested', new v.ValiError(token.issues));
            error(404, 'invitation not found');
        }

        const result = await getAssignmentByInviteToken(db, token.output);
        if (result === null) {
            logger.fatal('invitation not found', void 0, {
                'assignment.invite_token_present': true,
            });
            error(404, 'invitation not found');
        }

        if (session === null) {
            logger.error('missing session, redirecting to sign-in');
            cookies.set(RETURN_TO_COOKIE, `/invite/${token.output}`, {
                path: '/',
                httpOnly: true,
                secure: !dev,
                sameSite: 'lax',
                maxAge: RETURN_TO_MAX_AGE_SECONDS,
            });
            redirect(303, '/auth/sign-in');
        }

        span.setAttributes({
            'user.id': session.user.id,
            'assignment.id': result.assignment.id,
            'program.id': result.program.id,
        });

        const [unclaimedEntries, claimedEntry, acceptedSubmission] = await Promise.all([
            listUnclaimedRosterEntries(db, result.program.id),
            getClaimedRosterEntry(db, result.program.id, session.user.id),
            getAcceptedSubmissionForUser(db, result.assignment.id, session.user.id),
        ]);

        return {
            assignment: {
                name: result.assignment.name,
                deadline: result.assignment.deadline,
            },
            unclaimedEntryNames: claimedEntry === null ? unclaimedEntries.map((entry) => entry.name) : [],
            claimedEntryName: claimedEntry?.name ?? null,
            acceptedRepo:
                acceptedSubmission === null
                    ? null
                    : { org: result.program.org, repoName: acceptedSubmission.repoName },
        };
    });
}

export const actions = {
    async accept({ locals: { session }, params, request }) {
        return await tracer.asyncSpan('accept-assignment-invite', async (span) => {
            const token = v.safeParse(InviteTokenSchema, params.token);
            if (!token.success) {
                logger.fatal('malformed invitation token requested', new v.ValiError(token.issues));
                error(404, 'invitation not found');
            }

            const result = await getAssignmentByInviteToken(db, token.output);
            if (result === null) {
                logger.fatal('invitation not found', void 0, {
                    'assignment.invite_token_present': true,
                });
                error(404, 'invitation not found');
            }

            if (session === null) {
                logger.fatal('unauthenticated assignment accept attempt');
                return fail(401, {
                    message: 'You must be signed in to accept this assignment.',
                    issues: [],
                });
            }

            span.setAttributes({
                'user.id': session.user.id,
                'assignment.id': result.assignment.id,
                'program.id': result.program.id,
            });

            const rawName = (await request.formData()).get('name');
            let rosterEntryName;
            if (typeof rawName === 'string' && rawName.trim() !== '') {
                const name = v.safeParse(RosterEntryNameSchema, rawName);
                if (!name.success) {
                    logger.fatal('invalid roster entry name', new v.ValiError(name.issues), {
                        'user.id': session.user.id,
                    });
                    return fail(422, {
                        message: 'Choose your name from the roster.',
                        issues: name.issues.map((issue) => ({
                            path: v.getDotPath(issue) ?? 'name',
                            message: issue.message,
                        })),
                    });
                }
                rosterEntryName = name.output;
            }

            const outcome = await acceptAssignment(db, {
                assignmentId: result.assignment.id,
                assignmentName: result.assignment.name,
                templateRepo: result.assignment.templateRepo,
                programId: result.program.id,
                org: result.program.org,
                userId: session.user.id,
                userLogin: session.user.login,
                rosterEntryName,
            });

            switch (outcome.status) {
                case 'accepted':
                case 'already-accepted':
                    logger.info('assignment accepted via invitation', {
                        'assignment.id': result.assignment.id,
                        'user.id': session.user.id,
                    });
                    return {
                        success: true,
                        already: outcome.status === 'already-accepted',
                        org: result.program.org,
                        repoName: outcome.repoName,
                    };
                case 'roster-name-required':
                    logger.fatal('roster entry name required but not provided', void 0, {
                        'user.id': session.user.id,
                    });
                    return fail(422, {
                        message: 'Choose your name from the roster.',
                        issues: [{ path: 'name', message: 'Choose your name from the roster.' }],
                    });
                case 'entry-missing':
                    logger.fatal('roster entry not found for the given name', void 0, {
                        'user.id': session.user.id,
                    });
                    return fail(422, {
                        message: 'That name is not on the roster for this program.',
                        issues: [{ path: 'name', message: 'That name is not on the roster.' }],
                    });
                case 'entry-claimed':
                    logger.fatal('roster entry already claimed by another student', void 0, {
                        'user.id': session.user.id,
                    });
                    return fail(409, {
                        message: 'That roster entry has already been claimed by another student.',
                        issues: [],
                    });
                case 'template-missing':
                    logger.fatal('template repository unavailable for repo creation', void 0, {
                        'user.id': session.user.id,
                        'assignment.id': result.assignment.id,
                    });
                    return fail(422, {
                        message:
                            'The template repository could not be used to create your assignment repo. Ask the instructor to verify that the template repository exists and is marked as a template, and that the GitHub App has repository administration access.',
                        issues: [],
                    });
                case 'github-unavailable':
                    logger.fatal('github repo creation failed', void 0, {
                        'user.id': session.user.id,
                        'assignment.id': result.assignment.id,
                    });
                    return fail(502, {
                        message: 'GitHub could not complete the assignment. Try again in a moment.',
                        issues: [],
                    });
                case 'app-not-installed':
                    logger.fatal('github app is not installed on the organization', void 0, {
                        'user.id': session.user.id,
                        'assignment.id': result.assignment.id,
                        'github.org': result.program.org,
                    });
                    return fail(502, {
                        message: `The GitHub App is not installed on the ${result.program.org} organization. Ask the instructor to install it.`,
                        issues: [],
                    });
                case 'repo-not-ready':
                    logger.fatal(
                        'repository did not materialize before the retries ran out',
                        void 0,
                        {
                            'user.id': session.user.id,
                            'assignment.id': result.assignment.id,
                        },
                    );
                    return fail(503, {
                        message:
                            'GitHub is still setting up your assignment repository. Refresh the page and try again in a few seconds.',
                        issues: [],
                    });
                case 'feedback-pr-unavailable':
                    logger.fatal('github rejected feedback pull request creation', void 0, {
                        'user.id': session.user.id,
                        'assignment.id': result.assignment.id,
                    });
                    return fail(502, {
                        message:
                            'GitHub could not create the Feedback pull request. Try accepting again in a moment.',
                        issues: [],
                    });
                default:
                    logger.fatal('unhandled accept outcome', void 0, {
                        'user.id': session.user.id,
                    });
                    return fail(500, {
                        message: 'Something went wrong. Try again.',
                        issues: [],
                    });
            }
        });
    },
};
