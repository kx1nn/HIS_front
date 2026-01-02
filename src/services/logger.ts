// src/services/logger.ts
const isProd = Boolean(import.meta.env && import.meta.env.PROD);

export interface LogEntry {
    timestamp: number;
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    details?: unknown[];
}

const MAX_LOGS = 50;
const recentLogs: LogEntry[] = [];

function addLog(level: LogEntry['level'], args: unknown[]) {
    const message = args.map(a =>
        typeof a === 'string' ? a :
            a instanceof Error ? a.message :
                JSON.stringify(a)
    ).join(' ');

    recentLogs.unshift({
        timestamp: Date.now(),
        level,
        message,
        details: args
    });

    if (recentLogs.length > MAX_LOGS) {
        recentLogs.pop();
    }
}

export function getRecentLogs() {
    return recentLogs;
}

export function clearLogs() {
    recentLogs.length = 0;
}

export function error(...args: unknown[]) {
    addLog('error', args);
    if (isProd) {
        // TODO: replace with remote error reporting (Sentry, LogRocket, etc.)
        // For now, still log to console in prod to avoid silent failures.
        console.error(...args);
    } else {
        console.error(...args);
    }
}

export function warn(...args: unknown[]) {
    addLog('warn', args);
    if (!isProd) console.warn(...args);
}

export function info(...args: unknown[]) {
    addLog('info', args);
    if (!isProd) console.info(...args);
}

export function debug(...args: unknown[]) {
    // Debug logs might be too noisy for the admin panel, maybe skip or optional
    // addLog('debug', args); 
    if (!isProd) console.debug(...args);
}

export default { error, warn, info, debug, getRecentLogs, clearLogs };
