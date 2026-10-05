import assert from 'node:assert/strict';
import { createSign } from 'node:crypto';

import { env } from '$env/dynamic/private';
import { Logger } from '$lib/server/telemetry/logger';
import { Tracer } from '$lib/server/telemetry/tracer';

import { AppInstallationSchema, InstallationTokenSchema } from './contracts';
import { GithubApiError, githubApi } from './client';

const SERVICE_NAME = 'github.app';
const logger = Logger.byName(SERVICE_NAME);
const tracer = Tracer.byName(SERVICE_NAME);

const JWT_TTL_SECONDS = 60;

let appCredentials: { clientId: string; privateKey: string } | null = null;

function getAppCredentials() {
    if (appCredentials !== null) return appCredentials;

    const clientId = env.GITHUB_APP_CLIENT_ID;
    assert(
        typeof clientId === 'string' && clientId.length > 0,
        'GITHUB_APP_CLIENT_ID must be set to the GitHub App client ID.',
    );

    const rawPrivateKey = env.GITHUB_APP_PRIVATE_KEY;
    assert(
        typeof rawPrivateKey === 'string' && rawPrivateKey.length > 0,
        'GITHUB_APP_PRIVATE_KEY must be set to the GitHub App private key.',
    );

    appCredentials = { clientId, privateKey: rawPrivateKey.replaceAll('\\n', '\n') };
    return appCredentials;
}

/** Signs a GitHub App server-to-server JWT (`iss` = client ID). */
function mintAppJwt(clientId: string, privateKey: string, issuedAt: number) {
    function encode(value: unknown) {
        return Buffer.from(JSON.stringify(value)).toString('base64url');
    }
    const header = encode({ alg: 'RS256', typ: 'JWT' });
    const payload = encode({ iss: clientId, iat: issuedAt, exp: issuedAt + JWT_TTL_SECONDS });
    const signature = createSign('RSA-SHA256')
        .update(`${header}.${payload}`)
        .sign(privateKey)
        .toString('base64url');
    return `${header}.${payload}.${signature}`;
}

/**
 * Mints an installation access token for a known installation id. A webhook
 * payload carries the installation id directly, so this needs no org lookup.
 */
export async function getInstallationToken(installationId: number) {
    return await tracer.asyncSpan('get-installation-token', async (span) => {
        span.setAttribute('github.installation.id', installationId);

        const { clientId, privateKey } = getAppCredentials();
        const appJwt = mintAppJwt(clientId, privateKey, Math.floor(Date.now() / 1000));

        const created = await githubApi(
            `/app/installations/${installationId}/access_tokens`,
            InstallationTokenSchema,
            { method: 'POST', token: appJwt },
        );
        logger.debug('minted an installation access token', {
            'github.installation.id': installationId,
            'github.installation.token_expires_at': created.expires_at,
        });

        return created.token;
    });
}

/**
 * Mints an installation access token for the app's installation on `org`.
 * Returns `null` when the app is not installed on the org; otherwise the
 * token is used for server-to-server calls (repo provisioning).
 */
export async function getOrgInstallationToken(org: string) {
    return await tracer.asyncSpan('get-org-installation-token', async (span) => {
        span.setAttribute('github.org', org);

        const { clientId, privateKey } = getAppCredentials();
        const appJwt = mintAppJwt(clientId, privateKey, Math.floor(Date.now() / 1000));

        let installation: { id: number };
        try {
            installation = await githubApi(
                `/orgs/${encodeURIComponent(org)}/installation`,
                AppInstallationSchema,
                { token: appJwt },
            );
        } catch (error) {
            if (error instanceof GithubApiError)
                switch (error.status) {
                    case 404:
                        logger.debug('github app is not installed on the organization', {
                            'github.org': org,
                        });
                        return null;
                    default:
                        throw error;
                }
            else throw error;
        }
        span.setAttribute('github.installation.id', installation.id);

        return await getInstallationToken(installation.id);
    });
}
