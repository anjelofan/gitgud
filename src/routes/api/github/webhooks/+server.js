import * as v from 'valibot';
import { error } from '@sveltejs/kit';

import { db } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { getInstallationToken } from '$lib/server/github/app';
import { Logger } from '$lib/server/telemetry/logger';
import { recordGradingRun } from '$lib/features/assignments/grading.server';
import { resolveSubmissionForRepo } from '$lib/features/assignments/queries.server';
import { Tracer } from '$lib/server/telemetry/tracer';
import { verifyWebhookSignature } from '$lib/server/github/webhook';
import { WorkflowRunWebhookSchema } from '$lib/server/github/contracts';

const SERVICE_NAME = 'routes.api.github.webhooks';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const WORKFLOW_RUN_EVENT = 'workflow_run';
const COMPLETED_ACTION = 'completed';

/** GitHub reads any 2xx as delivered, so every ignored delivery answers 204. */
function accepted() {
    return new Response(null, { status: 204 });
}

export async function POST({ request }) {
    return await tracer.asyncSpan('github-webhook-delivery', async (span) => {
        const event = request.headers.get('x-github-event');
        const delivery = request.headers.get('x-github-delivery');
        span.setAttributes({
            'github.webhook.event': event ?? 'none',
            'github.webhook.delivery': delivery ?? 'none',
        });

        const secret = env.GITHUB_WEBHOOK_SECRET;
        if (typeof secret !== 'string' || secret.length === 0) {
            logger.fatal('GITHUB_WEBHOOK_SECRET is not configured; refusing deliveries', void 0, {
                'github.webhook.delivery': delivery ?? 'none',
            });
            error(500, 'Webhook endpoint is not configured.');
        }

        // Every delivery is authenticated before it is interpreted, so a
        // misconfigured secret shows up on the very next delivery — including
        // the ping GitHub sends when the webhook is saved.
        const body = await request.text();
        if (!verifyWebhookSignature(secret, body, request.headers.get('x-hub-signature-256'))) {
            logger.error('github webhook delivery failed signature verification', void 0, {
                'github.webhook.delivery': delivery ?? 'none',
            });
            error(401, 'Invalid webhook signature.');
        }

        // Only a completed workflow run can carry a grading result; every other
        // delivery is acknowledged so GitHub stops redelivering it.
        if (event !== WORKFLOW_RUN_EVENT) {
            span.setAttribute('github.webhook.outcome', 'ignored-event');
            return accepted();
        }

        const payload = v.parse(WorkflowRunWebhookSchema, JSON.parse(body));
        if (payload.action !== COMPLETED_ACTION) {
            span.setAttribute('github.webhook.outcome', 'ignored-action');
            return accepted();
        }

        const org = payload.repository.owner.login;
        const repoName = payload.repository.name;
        span.setAttributes({ 'github.org': org, 'submission.repo_name': repoName });

        // Only a repository this org actually grades is worth an installation
        // token and the check suite reads that follow, so anything else stops
        // here rather than authenticating for a repository we will not score.
        const lookup = await resolveSubmissionForRepo(db, org, repoName);
        if (lookup.status !== 'found') {
            span.setAttribute('github.webhook.outcome', `ignored-${lookup.status}`);
            logger.debug('workflow run does not belong to a graded repository', {
                'github.org': org,
                'submission.repo_name': repoName,
                'submission.lookup': lookup.status,
            });
            return accepted();
        }

        const outcome = await recordGradingRun(db, {
            token: await getInstallationToken(payload.installation.id),
            org,
            repoName,
            run: {
                id: payload.workflow_run.id,
                name: payload.workflow_run.name,
                checkSuiteId: payload.workflow_run.check_suite_id,
                headSha: payload.workflow_run.head_sha,
                conclusion: payload.workflow_run.conclusion,
            },
        });
        span.setAttribute('github.webhook.outcome', outcome.status);
        logger.info('github webhook delivery handled', {
            'github.org': org,
            'submission.repo_name': repoName,
            'github.workflow_run.id': payload.workflow_run.id,
            'grading.outcome': outcome.status,
        });

        return new Response(null, { status: 202 });
    });
}
