// src/services/logger.ts
const isProd = Boolean(import.meta.env && import.meta.env.PROD);

/**
 * Sentry 配置（可通过环境变量启用）
 */
const SENTRY_ENABLED = Boolean(import.meta.env.VITE_SENTRY_ENABLED);
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

type SentryLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug' | 'critical' | 'warn';
type SentryLike = {
    captureException?: (error: unknown, context?: { level?: SentryLevel }) => void;
    captureMessage?: (message: string, level?: SentryLevel) => void;
};

/**
 * 上报错误到 Sentry
 * 注意：需要先安装 @sentry/browser 并在 main.tsx 中初始化
 * @param error 错误对象或消息
 * @param level 错误级别
 */
function reportToSentry(error: unknown, level: 'error' | 'warn' = 'error') {
    if (!SENTRY_ENABLED || !SENTRY_DSN) return;

    // 依赖外部初始化：在 main.tsx 中加载 @sentry/browser 并赋值 window.Sentry
    const sentry = (globalThis as { Sentry?: SentryLike }).Sentry;
    if (!sentry || (!sentry.captureException && !sentry.captureMessage)) return;

    try {
        if (error instanceof Error && sentry.captureException) {
            sentry.captureException(error, { level });
        } else if (typeof error === 'string' && sentry.captureMessage) {
            sentry.captureMessage(error, level);
        } else if (sentry.captureMessage) {
            sentry.captureMessage(JSON.stringify(error), level);
        }
    } catch {
        // 忽略上报失败
    }
}

/**
 * 日志条目结构
 */
export interface LogEntry {
    timestamp: number;
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
    details?: unknown[];
}

/** 最大保留日志条目数量 */
const MAX_LOGS = 50;
const recentLogs: LogEntry[] = [];

/**
 * 添加一条日志并保存在内存中（仅用于前端调试与展示）
 * @param level 日志等级
 * @param args 要记录的任意参数
 */
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

/**
 * 获取最近的日志列表（只读）
 * @returns LogEntry[]
 */
export function getRecentLogs() {
    return recentLogs;
}

/** 清空内存中的日志 */
export function clearLogs() {
    recentLogs.length = 0;
}

/**
 * 记录错误日志并在控制台输出
 * @param args 任意要记录的信息或 Error
 */
export function error(...args: unknown[]) {
    addLog('error', args);

    // 上报首个错误到 Sentry（如果启用）
    if (args.length > 0) {
        reportToSentry(args[0], 'error');
    }

    if (isProd) {
        // 生产环境仍然输出到控制台，避免静默失败
        console.error(...args);
    } else {
        console.error(...args);
    }
}

/** 记录警告日志 */
export function warn(...args: unknown[]) {
    addLog('warn', args);

    // 上报警告到 Sentry（如果启用）
    if (args.length > 0 && isProd) {
        reportToSentry(args[0], 'warn');
    }

    if (!isProd) console.warn(...args);
}

/** 记录信息日志 */
export function info(...args: unknown[]) {
    addLog('info', args);
    if (!isProd) console.info(...args);
}

/** 记录调试日志（生产环境通常不输出） */
export function debug(...args: unknown[]) {
    // Debug logs might be too noisy for the admin panel, maybe skip or optional
    // addLog('debug', args); 
    if (!isProd) console.debug(...args);
}

export default { error, warn, info, debug, getRecentLogs, clearLogs };
