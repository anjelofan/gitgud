import process from 'node:process';

import {
    BatchLogRecordProcessor,
    ConsoleLogRecordExporter,
    SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

import { env } from '$env/dynamic/private';

// Without an OTLP endpoint, logger output is invisible; surface it on the
// console during development instead. Production without an endpoint stays
// silent, matching the documented contract.
const logRecordProcessors =
    !env.OTEL_EXPORTER_OTLP_ENDPOINT && env.NODE_ENV !== 'production'
        ? [new SimpleLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() })]
        : [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })];

const sdk = new NodeSDK({
    serviceName: 'gitgud',
    instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
    logRecordProcessors,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
});
sdk.start();

process.once('sveltekit:shutdown', async (reason) => {
    // eslint-disable-next-line no-console
    console.warn('graceful shutdown...', reason);
    await sdk.shutdown();
});
