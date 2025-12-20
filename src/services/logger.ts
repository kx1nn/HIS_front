// src/services/logger.ts
const isProd = Boolean(import.meta.env && import.meta.env.PROD);

export function error(...args: unknown[]) {
    if (isProd) {
        // TODO: replace with remote error reporting (Sentry, LogRocket, etc.)
        // For now, still log to console in prod to avoid silent failures.
        console.error(...args);
    } else {
        console.error(...args);
    }
}

export function warn(...args: unknown[]) {
    if (!isProd) console.warn(...args);
}

export function info(...args: unknown[]) {
    if (!isProd) console.info(...args);
}

export function debug(...args: unknown[]) {
    if (!isProd) console.debug(...args);
}

export default { error, warn, info, debug };
