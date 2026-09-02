export async function handle({ event, resolve }) {
    const { getClientAddress, request } = event;
    const { logger, tracer } = await import('./hooks.telemetry');

    tracer.span('http-request', (span) => {
        let clientAddress: string | undefined;
        try {
            clientAddress = getClientAddress();
        } catch (error) {
            if (error instanceof Error) logger.error('failed to get client address', error);
            else throw error;
        }

        span.setAttributes({
            'http.request.id': crypto.randomUUID(),
            'http.request.method': request.method,
            'http.request.url': request.url,
            'network.client.address': clientAddress,
        });

        const realIp = request.headers.get('X-Real-IP');
        if (realIp !== null) span.setAttribute('network.client.real_ip', realIp);

        const forwardedFor = request.headers.get('X-Forwarded-For');
        if (forwardedFor !== null) span.setAttribute('network.client.forwarded_for', forwardedFor);

        logger.trace('resolving request...');
    });

    return await resolve(event);
}
export async function handleError({ error }) {
    const { Logger } = await import('$lib/server/telemetry/logger');
    const logger = Logger.byName('hooks.handleError');
    if (error instanceof Error) logger.fatal(error.message, error);
    else logger.fatal(String(error));
}
