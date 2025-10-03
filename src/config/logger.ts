import pino from 'pino';

/**
 * Logger Configuration
 * 
 * High-performance JSON logger for the CV evaluation system.
 * Provides structured logging for API requests, evaluation stages,
 * and system monitoring.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false
        }
    },
    serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err
    }
});
