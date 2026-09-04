import { describe, expect, it } from 'vitest';

import { constantTimeEqual, decryptToken, encryptToken, hashSessionSecret } from './crypto';

describe('crypto', () => {
    describe('encryptToken/decryptToken', () => {
        it('round-trips the plaintext', () => {
            const plaintext = 'ghu_16C7e42F292c6912E7710c838347Ae178B4a';
            expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
        });

        it('rejects a tampered ciphertext', () => {
            const encoded = encryptToken('ghu_secret');
            const [version, iv, ciphertext, tag] = encoded.split('.');
            const flipped = `${version}.${iv}.${ciphertext.slice(0, -2)}AA.${tag}`;
            expect(() => decryptToken(flipped)).toThrow();
        });

        it('rejects a wrong-format payload', () => {
            expect(() => decryptToken('nonsense')).toThrow(/Malformed/u);
            expect(() => decryptToken('v2.a.b.c')).toThrow(/Malformed/u);
        });

        it('never produces the same ciphertext twice', () => {
            expect(encryptToken('ghu_secret')).not.toBe(encryptToken('ghu_secret'));
        });
    });

    describe('hashSessionSecret', () => {
        it('produces the sha-256 hex digest of the secret', () => {
            // Independently derived oracle: `echo -n secret | sha256sum`.
            expect(hashSessionSecret('secret')).toBe(
                '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
            );
        });
    });

    describe('constantTimeEqual', () => {
        it('accepts equal strings', () => {
            expect(constantTimeEqual('state-1', 'state-1')).toBe(true);
        });

        it('rejects unequal strings of equal length', () => {
            expect(constantTimeEqual('state-1', 'state-2')).toBe(false);
        });

        it('rejects strings of different lengths', () => {
            expect(constantTimeEqual('short', 'longer-string')).toBe(false);
        });
    });
});
