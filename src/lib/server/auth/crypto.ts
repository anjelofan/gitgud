import assert from 'node:assert/strict';
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    hkdfSync,
    randomBytes,
    timingSafeEqual,
} from 'node:crypto';

import { building } from '$app/env';
import { env } from '$env/dynamic/private';

function initTokenKey() {
    if (!building)
        assert(
            typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32,
            'SESSION_SECRET must be set to at least 32 characters.',
        );

    const material = env.SESSION_SECRET ?? 'insecure-build-placeholder';
    const derived = hkdfSync(
        'sha256',
        material,
        'gitgud-token-encryption',
        'github-token-storage',
        32,
    );
    return Buffer.from(derived);
}

const tokenKey = initTokenKey();

const TOKEN_FORMAT_VERSION = 'v1';
const TOKEN_PART_COUNT = 4;

export function hashSessionSecret(secret: string) {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function encryptToken(plaintext: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', tokenKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        TOKEN_FORMAT_VERSION,
        iv.toString('base64url'),
        ciphertext.toString('base64url'),
        tag.toString('base64url'),
    ].join('.');
}

export function decryptToken(encoded: string) {
    const parts = encoded.split('.');
    if (parts.length !== TOKEN_PART_COUNT || parts[0] !== TOKEN_FORMAT_VERSION)
        throw new Error('Malformed encrypted token payload.');

    const [, iv, ciphertext, tag] = parts;
    const decipher = createDecipheriv('aes-256-gcm', tokenKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}

export function constantTimeEqual(a: string, b: string): boolean {
    const aBytes = Buffer.from(a, 'utf8');
    const bBytes = Buffer.from(b, 'utf8');
    return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}
