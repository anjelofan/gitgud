import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';

const path = '.env.test.local';
const current = existsSync(path) ? readFileSync(path, 'utf8') : '';

if (current.split('\n').some((line) => line.startsWith('GITHUB_APP_PRIVATE_KEY='))) {
    process.stdout.write(`${path} already contains GITHUB_APP_PRIVATE_KEY.\n`);
} else {
    const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    appendFileSync(path, `GITHUB_APP_PRIVATE_KEY=${privateKey.replaceAll('\n', '\\n')}\n`);
    process.stdout.write(`Generated test GitHub App key in ${path}.\n`);
}
