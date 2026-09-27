import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const path = '.env.test.local';
const current = existsSync(path) ? readFileSync(path, 'utf8') : '';

const generated = [];

/** @param {string} name */
function missing(name) {
    return !current.split('\n').some((line) => line.startsWith(`${name}=`));
}

if (missing('GITHUB_APP_CLIENT_SECRET'))
    generated.push(`GITHUB_APP_CLIENT_SECRET=${randomBytes(32).toString('base64url')}`);

if (missing('SESSION_SECRET'))
    generated.push(`SESSION_SECRET=${randomBytes(32).toString('base64url')}`);

if (missing('GITHUB_APP_PRIVATE_KEY')) {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    generated.push(`GITHUB_APP_PRIVATE_KEY=${privateKey.replaceAll('\n', '\\n')}`);
}

if (generated.length > 0) {
    const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(path, `${separator}${generated.join('\n')}\n`);
    process.stdout.write(`Generated ${generated.length.toString()} test values in ${path}.\n`);
} else {
    process.stdout.write(`${path} already contains all generated test values.\n`);
}
