// src/services/logger.ts
const isProd = Boolean(import.meta.env && import.meta.env.PROD);

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
    if (isProd) {
        // TODO: replace with remote error reporting (Sentry, LogRocket, etc.)
        // For now, still log to console in prod to avoid silent failures.
        console.error(...args);
    } else {
        console.error(...args);
    }
}

/** 记录警告日志 */
export function warn(...args: unknown[]) {
    addLog('warn', args);
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
