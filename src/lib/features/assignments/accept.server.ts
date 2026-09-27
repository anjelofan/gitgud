import assert from 'node:assert/strict';

import { and, eq, isNull } from 'drizzle-orm';

import {
    addCollaborator,
    createBranch,
    createCommit,
    createPullRequest,
    createRepoFromTemplate,
    getBranchHead,
    getCommit,
    listOpenPullRequests,
    updateBranch,
} from '$lib/server/github/repos';
import type { DbConnection } from '$lib/server/db';
import { getOrgInstallationToken } from '$lib/server/github/app';
import { GithubApiError } from '$lib/server/github/client';
import type { GitRef, PullRequest } from '$lib/server/github/contracts';
import { Logger } from '$lib/server/telemetry/logger';
import { rosterEntries, submissions } from '$lib/server/db/schema';
import { Tracer } from '$lib/server/telemetry/tracer';

import { withRetries } from './retry.server';

const SERVICE_NAME = 'assignments.accept';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

/** Template-generated repositories materialize asynchronously; poll the first read. */
const BRANCH_READ_ATTEMPTS = 5;
const BRANCH_READ_BASE_DELAY_MS = 250;
const FEEDBACK_SETUP_COMMIT_MESSAGE = 'Setting up GitGud Feedback';

/**
 * The feedback pull request heads `main` and bases `feedback`: the head branch
 * tracks `main`, so every student push appears in the PR automatically — the
 * "echo" behavior. Authored by the app via the installation token. Copy
 * adapted from GitHub Classroom's feedback pull request.
 */
const FEEDBACK_PULL_REQUEST = {
    title: 'Feedback',
    head: 'main',
    base: 'feedback',
    body: [
        ':wave:! GitGud created this pull request as a place for your teacher to leave feedback on your work. It will update automatically. **Don’t close or merge this pull request**, unless you’re instructed to do so by your teacher.',
        'In this pull request, your teacher can leave comments and feedback on your code. Click the **Subscribe** button to be notified if that happens.',
        'Click the **Files changed** or **Commits** tab to see all of the changes pushed to the default branch since the assignment started. Your teacher can see this too.',
        '<details>',
        '<summary>',
        '<strong>Notes for teachers</strong>',
        '</summary>',
        '',
        'Use this PR to leave feedback. Here are some tips:',
        '- Click the **Files changed** tab to see all of the changes pushed to the default branch since the assignment started. To leave comments on specific lines of code, put your cursor over a line of code and click the blue **+** (plus sign). To learn more about comments, read “[Commenting on a pull request](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/commenting-on-a-pull-request)”.',
        '- Click the **Commits** tab to see the commits pushed to the default branch. Click a commit to see specific changes.',
        '- If autograding is enabled, then click the **Checks** tab to see the results.',
        '- This page is an overview. It shows commits, line comments, and general comments. You can leave a general comment below.',
        '</details>',
    ].join('\n'),
} as const;

export interface AcceptAssignmentArgs {
    assignmentId: string;
    assignmentName: string;
    templateRepo: string;
    programId: string;
    org: string;
    userId: string;
    userLogin: string;
    rosterEntryName: string | undefined;
}

export type AcceptAssignmentOutcome =
    | { status: 'accepted'; repoName: string }
    | { status: 'already-accepted'; repoName: string }
    | { status: 'roster-name-required' }
    | { status: 'entry-missing' }
    | { status: 'entry-claimed' }
    | { status: 'template-missing' }
    | { status: 'github-unavailable' }
    | { status: 'app-not-installed' }
    | { status: 'repo-not-ready' }
    | { status: 'feedback-pr-unavailable' };

/** Derives the deterministic student repo name from the assignment name and GitHub login. */
function repoNameFor(assignmentName: string, login: string) {
    const stem = assignmentName
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-+|-+$/gu, '');
    const safeStem = stem.length === 0 ? 'assignment' : stem;
    return `${safeStem}-${login}`;
}

function isUniqueViolation(error: unknown) {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505'
    );
}

type ClaimResult = { rosterEntryId: string } | AcceptAssignmentOutcome;

/**
 * Claims the roster entry named in `args.rosterEntryName` for the user, or
 * reports why it cannot be claimed.
 */
async function claimRosterEntry(
    db: DbConnection,
    args: AcceptAssignmentArgs,
    span: { setAttribute: (name: string, value: string) => void },
): Promise<ClaimResult> {
    if (typeof args.rosterEntryName !== 'string') return { status: 'roster-name-required' };

    let claimedRows: { id: string }[];
    try {
        claimedRows = await db
            .update(rosterEntries)
            .set({ claimedUserId: args.userId, claimedAt: new Date() })
            .where(
                and(
                    eq(rosterEntries.programId, args.programId),
                    eq(rosterEntries.name, args.rosterEntryName),
                    isNull(rosterEntries.claimedUserId),
                ),
            )
            .returning({ id: rosterEntries.id });
    } catch (error) {
        // Two concurrent claims by the same user trip the
        // `(programId, claimedUserId)` unique index; use whichever entry won.
        if (!isUniqueViolation(error)) throw error;

        const winners = await db
            .select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(
                and(
                    eq(rosterEntries.programId, args.programId),
                    eq(rosterEntries.claimedUserId, args.userId),
                ),
            )
            .limit(1);
        assert.ok(typeof winners[0] !== 'undefined');
        claimedRows = [winners[0]];
    }
    const [claimedRow] = claimedRows;

    if (typeof claimedRow === 'undefined') {
        const [existing] = await db
            .select({ id: rosterEntries.id })
            .from(rosterEntries)
            .where(
                and(
                    eq(rosterEntries.programId, args.programId),
                    eq(rosterEntries.name, args.rosterEntryName),
                ),
            )
            .limit(1);

        if (typeof existing !== 'undefined') return { status: 'entry-claimed' };

        logger.debug('roster entry not found for the given name', {
            'program.id': args.programId,
        });
        return { status: 'entry-missing' };
    }

    span.setAttribute('submission.roster_entry_id', claimedRow.id);
    return { rosterEntryId: claimedRow.id };
}

/**
 * Accepts an assignment for the given student: claims a roster entry on the
 * first accept, then creates the assignment repo from its template (with a
 * `feedback` branch mirroring `main`) and grants the student write access.
 * Repo provisioning uses the GitHub App's installation token for the org.
 */
export async function acceptAssignment(db: DbConnection, args: AcceptAssignmentArgs) {
    return await tracer.asyncSpan('accept-assignment', async (span) => {
        span.setAttributes({
            'user.id': args.userId,
            'user.login': args.userLogin,
            'assignment.id': args.assignmentId,
            'program.id': args.programId,
            'github.org': args.org,
        });

        const [claimedEntry] = await db
            .select({ id: rosterEntries.id, name: rosterEntries.name })
            .from(rosterEntries)
            .where(
                and(
                    eq(rosterEntries.programId, args.programId),
                    eq(rosterEntries.claimedUserId, args.userId),
                ),
            )
            .limit(1);

        let rosterEntryId: string;
        if (typeof claimedEntry === 'undefined') {
            const claim = await claimRosterEntry(db, args, span);
            if ('status' in claim) return claim;
            ({ rosterEntryId } = claim);
        } else {
            rosterEntryId = claimedEntry.id;
        }

        const [existingSubmission] = await db
            .select({ repoName: submissions.repoName })
            .from(submissions)
            .where(
                and(
                    eq(submissions.assignmentId, args.assignmentId),
                    eq(submissions.rosterEntryId, rosterEntryId),
                ),
            )
            .limit(1);
        if (typeof existingSubmission !== 'undefined') {
            logger.info('assignment already accepted', { 'assignment.id': args.assignmentId });
            return { status: 'already-accepted', repoName: existingSubmission.repoName } as const;
        }

        const instructorToken = await getOrgInstallationToken(args.org);
        if (instructorToken === null) {
            logger.fatal('github app is not installed on the organization', void 0, {
                'program.id': args.programId,
                'github.org': args.org,
            });
            return { status: 'app-not-installed' };
        }

        const repoName = repoNameFor(args.assignmentName, args.userLogin);
        span.setAttribute('submission.repo_name', repoName);

        let defaultBranch = 'main';
        try {
            const created = await createRepoFromTemplate(
                instructorToken,
                args.org,
                args.templateRepo,
                repoName,
            );
            defaultBranch = created.default_branch;
        } catch (error) {
            if (!(error instanceof GithubApiError)) throw error;
            switch (error.status) {
                case 422:
                    // A repo left behind by an earlier attempt keeps the deterministic name; reuse it.
                    logger.debug('assignment repo already exists, reusing it', {
                        'github.repo': repoName,
                    });
                    break;
                case 404:
                    logger.fatal('template repository unavailable for repo creation', error, {
                        'github.org': args.org,
                        'github.repo': args.templateRepo,
                    });
                    return { status: 'template-missing' };
                default:
                    logger.error('github repo creation failed', error, {
                        'github.org': args.org,
                    });
                    return { status: 'github-unavailable' };
            }
        }

        await db
            .insert(submissions)
            .values({ assignmentId: args.assignmentId, rosterEntryId, repoName })
            .onConflictDoNothing();

        let head: GitRef;
        try {
            head = await withRetries(
                () => getBranchHead(instructorToken, args.org, repoName, defaultBranch),
                {
                    attempts: BRANCH_READ_ATTEMPTS,
                    baseDelayMs: BRANCH_READ_BASE_DELAY_MS,
                    onRetry: (error, attempt) =>
                        logger.warn('repository not materialized yet, retrying', {
                            'github.repo': repoName,
                            'github.response.status_code':
                                error instanceof GithubApiError ? error.status : -1,
                            'retry.attempt': attempt,
                        }),
                },
            );
        } catch (error) {
            if (!(error instanceof GithubApiError)) throw error;
            switch (error.status) {
                case 404:
                case 409:
                    logger.fatal(
                        'repository did not materialize before the retries ran out',
                        error,
                        {
                            'github.repo': repoName,
                        },
                    );
                    return { status: 'repo-not-ready' };
                default:
                    logger.error('github branch head read failed', error, {
                        'github.repo': repoName,
                    });
                    return { status: 'github-unavailable' };
            }
        }

        try {
            await createBranch(instructorToken, args.org, repoName, 'feedback', head.object.sha);
        } catch (error) {
            if (!(error instanceof GithubApiError)) throw error;
            switch (error.status) {
                case 422:
                    // A feedback branch left behind by an earlier attempt is fine.
                    logger.debug('feedback branch already exists', { 'github.repo': repoName });
                    break;
                default:
                    logger.error('github feedback branch creation failed', error, {
                        'github.repo': repoName,
                    });
                    return { status: 'github-unavailable' };
            }
        }

        let feedbackPullRequests: PullRequest[];
        try {
            feedbackPullRequests = await listOpenPullRequests(
                instructorToken,
                args.org,
                repoName,
                'main',
                'feedback',
            );
        } catch (error) {
            if (!(error instanceof GithubApiError)) throw error;
            logger.error('github feedback pull requests could not be listed', error, {
                'github.repo': repoName,
            });
            return { status: 'github-unavailable' };
        }

        if (feedbackPullRequests.length === 0) {
            try {
                const currentCommit = await getCommit(
                    instructorToken,
                    args.org,
                    repoName,
                    head.object.sha,
                );
                if (currentCommit.message !== FEEDBACK_SETUP_COMMIT_MESSAGE) {
                    const setupCommit = await createCommit(
                        instructorToken,
                        args.org,
                        repoName,
                        FEEDBACK_SETUP_COMMIT_MESSAGE,
                        currentCommit.tree.sha,
                        currentCommit.sha,
                    );
                    await updateBranch(
                        instructorToken,
                        args.org,
                        repoName,
                        'main',
                        setupCommit.sha,
                    );
                }
            } catch (error) {
                if (!(error instanceof GithubApiError)) throw error;
                logger.error('github feedback setup commit failed', error, {
                    'github.repo': repoName,
                });
                return { status: 'github-unavailable' };
            }

            try {
                await createPullRequest(instructorToken, args.org, repoName, FEEDBACK_PULL_REQUEST);
            } catch (error) {
                if (!(error instanceof GithubApiError)) throw error;
                if (error.status === 422) {
                    const existing = await listOpenPullRequests(
                        instructorToken,
                        args.org,
                        repoName,
                        'main',
                        'feedback',
                    );
                    if (existing.length > 0) {
                        logger.debug('feedback pull request already exists', {
                            'github.repo': repoName,
                        });
                    } else {
                        logger.error('github rejected feedback pull request creation', error, {
                            'github.repo': repoName,
                        });
                        return { status: 'feedback-pr-unavailable' };
                    }
                } else {
                    logger.error('github feedback pull request creation failed', error, {
                        'github.repo': repoName,
                    });
                    return { status: 'github-unavailable' };
                }
            }
        }

        try {
            await addCollaborator(instructorToken, args.org, repoName, args.userLogin, 'push');
        } catch (error) {
            if (!(error instanceof GithubApiError)) throw error;
            logger.error('github collaborator invitation failed', error, {
                'github.repo': repoName,
            });
            return { status: 'github-unavailable' };
        }

        logger.info('assignment accepted', { 'assignment.id': args.assignmentId });
        return { status: 'accepted', repoName } as const;
    });
}
