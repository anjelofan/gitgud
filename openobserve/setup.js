/**
 * Scaffolds the local OpenObserve dev credentials
 * (`openobserve/secrets/dev/admin_email` + `admin_password`) and derives the
 * artifacts from them: the container's `ZO_ROOT_USER_*` values in `.env`
 * (passed through by the Compose service) and `.env.local`'s OTLP endpoint +
 * Authorization header for the app. Run via `pnpm docker:obs:setup`; see
 * docs/OPENOBSERVE.md.
 */
import path from 'node:path';
import process from 'node:process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const DEFAULT_SECRETS_DIR = 'openobserve/secrets/dev';
const ENV_FILE = '.env';
const ENV_LOCAL_FILE = '.env.local';
const OTLP_ENDPOINT = 'http://localhost:5080/api/default';
const OTLP_ENDPOINT_KEY = 'OTEL_EXPORTER_OTLP_ENDPOINT';
const OTLP_HEADERS_KEY = 'OTEL_EXPORTER_OTLP_HEADERS';
const ROOT_EMAIL_KEY = 'ZO_ROOT_USER_EMAIL';
const ROOT_PASSWORD_KEY = 'ZO_ROOT_USER_PASSWORD';

// A shell-set OPENOBSERVE_SECRETS_DIR wins over `.env`, matching Compose's
// interpolation for the same file.
const shellSecretsDir = process.env.OPENOBSERVE_SECRETS_DIR;
try {
    process.loadEnvFile('.env');
} catch {
    // `.env` is optional; the default secrets directory applies without it.
}
const secretsDir = shellSecretsDir ?? process.env.OPENOBSERVE_SECRETS_DIR ?? DEFAULT_SECRETS_DIR;
const emailFile = path.join(secretsDir, 'admin_email');
const passwordFile = path.join(secretsDir, 'admin_password');

/** Mirrors `$(cat file)`: strips trailing newlines, keeps the rest verbatim. */
function stripTrailingNewlines(contents) {
    return contents.replace(/[\r\n]+$/u, '');
}

async function pathExists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

async function readSecret(file) {
    if (await pathExists(file)) return stripTrailingNewlines(await readFile(file, 'utf8'));

    try {
        await copyFile(`${file}.example`, file);
    } catch (error) {
        throw new Error(
            `Cannot create ${file}: neither it nor ${file}.example exists. Create it with the OpenObserve admin credentials (see docs/OPENOBSERVE.md).`,
            { cause: error },
        );
    }
    return stripTrailingNewlines(await readFile(file, 'utf8'));
}

/** OpenObserve panics on boot when the root password violates this policy. */
function passwordPolicyViolation(password) {
    if (password.length < 8 || password.length > 128) return 'must be 8-128 characters long';

    if (!/[a-z]/u.test(password)) return 'must contain a lowercase letter';

    if (!/[A-Z]/u.test(password)) return 'must contain an uppercase letter';

    if (!/[0-9]/u.test(password)) return 'must contain a digit';

    if (!/[^A-Za-z0-9]/u.test(password)) return 'must contain a special character';

    return null;
}

/**
 * Quotes a value for Compose's dotenv parser (`.env` and `env_file`) without
 * altering it: single quotes keep values fully literal; double quotes (the
 * fallback for values containing `'`) interpolate `$`, so `\`, `"`, and `$`
 * are escaped.
 */
function quoteEnvValue(value) {
    if (value.includes("'")) {
        const escaped = value
            .replace(/[\\"]/gu, (match) => `\\${match}`)
            .replace(/\$/gu, () => '$$');
        return `"${escaped}"`;
    }
    return `'${value}'`;
}

/** The `ZO_ROOT_USER_*` lines the Compose service passes through from `.env`. */
function deriveSecretEnvLines(email, password) {
    return [
        `${ROOT_EMAIL_KEY}=${quoteEnvValue(email)}`,
        `${ROOT_PASSWORD_KEY}=${quoteEnvValue(password)}`,
    ];
}

function deriveOtlpLines(email, password) {
    const authorization = Buffer.from(`${email}:${password}`).toString('base64');
    return [
        `${OTLP_ENDPOINT_KEY}=${OTLP_ENDPOINT}`,
        `${OTLP_HEADERS_KEY}=Authorization=Basic ${authorization}`,
    ];
}

function isDerivedOtlpLine(line) {
    return line.startsWith(`${OTLP_ENDPOINT_KEY}=`) || line.startsWith(`${OTLP_HEADERS_KEY}=`);
}

function isDerivedSecretLine(line) {
    return line.startsWith(`${ROOT_EMAIL_KEY}=`) || line.startsWith(`${ROOT_PASSWORD_KEY}=`);
}

/** Replaces the derived lines, preserving every other line. */
function withDerivedLines(existingContents, derivedLines, isDerivedLine) {
    const keptLines = existingContents.split('\n').filter((line) => !isDerivedLine(line));
    while (keptLines.length > 0 && keptLines.at(-1).trim() === '') keptLines.pop();

    return `${[...keptLines, ...derivedLines].join('\n')}\n`;
}

/** Reads a file's contents, treating a missing file as empty. */
async function readIfExists(file) {
    if (!(await pathExists(file))) return '';
    return readFile(file, 'utf8');
}

async function main() {
    await mkdir(secretsDir, { recursive: true });

    const email = await readSecret(emailFile);
    const password = await readSecret(passwordFile);
    if (/[\r\n]/u.test(email)) throw new Error(`${emailFile} must contain a single line.`);
    if (/[\r\n]/u.test(password)) throw new Error(`${passwordFile} must contain a single line.`);

    const violation = passwordPolicyViolation(password);
    if (violation !== null)
        throw new Error(
            `${passwordFile} ${violation}; OpenObserve rejects weaker passwords at startup (see docs/OPENOBSERVE.md).`,
        );

    await writeFile(
        ENV_FILE,
        withDerivedLines(
            await readIfExists(ENV_FILE),
            deriveSecretEnvLines(email, password),
            isDerivedSecretLine,
        ),
    );

    await writeFile(
        ENV_LOCAL_FILE,
        withDerivedLines(
            await readIfExists(ENV_LOCAL_FILE),
            deriveOtlpLines(email, password),
            isDerivedOtlpLine,
        ),
    );

    // eslint-disable-next-line no-console
    console.log(
        `OpenObserve local config ready: ${secretsDir} credentials; derived ${ENV_FILE} + ${ENV_LOCAL_FILE}`,
    );
}

try {
    await main();
} catch (error) {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
