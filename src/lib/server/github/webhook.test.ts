import { createHmac } from 'node:crypto';

import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { verifyWebhookSignature } from './webhook';
import { WorkflowRunWebhookSchema } from './contracts';

const SECRET = 'test-webhook-secret';
const PAYLOAD = JSON.stringify({ action: 'completed' });

/** Signs independently of the implementation, the way GitHub does. */
function sign(secret: string, payload: string) {
    return `sha256=${createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
    it('accepts a delivery signed with the secret', () => {
        expect(verifyWebhookSignature(SECRET, PAYLOAD, sign(SECRET, PAYLOAD))).toBe(true);
    });

    it('rejects a delivery signed with another secret', () => {
        expect(verifyWebhookSignature(SECRET, PAYLOAD, sign('another-secret', PAYLOAD))).toBe(
            false,
        );
    });

    it('rejects a body that changed after it was signed', () => {
        expect(verifyWebhookSignature(SECRET, `${PAYLOAD} `, sign(SECRET, PAYLOAD))).toBe(false);
    });

    it('rejects a delivery with no signature header', () => {
        expect(verifyWebhookSignature(SECRET, PAYLOAD, null)).toBe(false);
    });

    it('rejects a signature that is not a sha256 digest', () => {
        const signature = sign(SECRET, PAYLOAD).replace('sha256=', 'sha1=');
        expect(verifyWebhookSignature(SECRET, PAYLOAD, signature)).toBe(false);
    });

    it('rejects a sha256 signature of the wrong length', () => {
        expect(verifyWebhookSignature(SECRET, PAYLOAD, 'sha256=abc123')).toBe(false);
    });
});

describe('WorkflowRunWebhookSchema', () => {
    const delivery = {
        action: 'completed',
        installation: { id: 42 },
        repository: { name: 'graded-repo', owner: { login: 'grading-org' } },
        workflow_run: {
            id: 8101,
            name: 'Autograding Tests',
            check_suite_id: 9101,
            head_sha: 'sha-scored',
            conclusion: 'success',
        },
    };

    it('parses the fields a delivery is graded from', () => {
        expect(v.safeParse(WorkflowRunWebhookSchema, delivery).success).toBe(true);
    });

    it('parses an in-progress run whose conclusion is not recorded', () => {
        expect(
            v.safeParse(WorkflowRunWebhookSchema, {
                ...delivery,
                action: 'in_progress',
                workflow_run: { ...delivery.workflow_run, conclusion: null },
            }).success,
        ).toBe(true);
    });

    it('rejects a delivery without a check suite id', () => {
        const { check_suite_id: _ignored, ...withoutSuite } = delivery.workflow_run;
        expect(
            v.safeParse(WorkflowRunWebhookSchema, {
                ...delivery,
                workflow_run: withoutSuite,
            }).success,
        ).toBe(false);
    });
});
