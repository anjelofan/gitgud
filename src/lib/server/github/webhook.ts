import { createHmac, timingSafeEqual } from 'node:crypto';

/** GitHub prefixes the signature header with the digest algorithm it used. */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verifies the `X-Hub-Signature-256` HMAC GitHub sends with every delivery.
 * GitHub signs the raw request body with the webhook secret, so a mismatch
 * means the request did not come from GitHub and must not be acted on.
 */
export function verifyWebhookSignature(
    secret: string,
    payload: string,
    signatureHeader: string | null,
): boolean {
    if (signatureHeader === null) return false;
    if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) return false;

    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const received = signatureHeader.slice(SIGNATURE_PREFIX.length);
    // `timingSafeEqual` throws on differing lengths; a short or long signature
    // is rejected here so that comparison stays a fixed-time operation.
    if (received.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}
