import process from 'node:process';

import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

const sdk = new NodeSDK({
  serviceName: 'gitgud',
  instrumentations: [new HttpInstrumentation(), new PgInstrumentation()],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
});
sdk.start();

process.once('sveltekit:shutdown', async reason => {
  // eslint-disable-next-line no-console
  console.warn('graceful shutdown...', reason);
  await sdk.shutdown();
});