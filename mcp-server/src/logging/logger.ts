import pino from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'rut', '*.rut', '*.*.rut',
  'notes', '*.notes',
  'observations', '*.observations',
  'phone', '*.phone',
  'email', '*.email',
  'address', '*.address',
];

export interface CreateLoggerOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  stream?: DestinationStream;
}

export function createLogger(opts: CreateLoggerOptions) {
  const config: LoggerOptions = {
    level: opts.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return opts.stream ? pino(config, opts.stream) : pino(config);
}

export type Logger = ReturnType<typeof createLogger>;
