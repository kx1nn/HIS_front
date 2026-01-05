// src/utils/casing.ts
// Utilities to convert between snake_case and camelCase deeply for objects/arrays

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return Object.prototype.toString.call(v) === '[object Object]';
}

export function toCamel(s: string): string {
    return s.replace(/_([a-z0-9])/g, (_, p) => p.toUpperCase());
}

export function toSnake(s: string): string {
    return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function deepCamelize<T>(input: T): T {
    if (input === null || input === undefined) return input;
    if (Array.isArray(input)) return input.map((v) => deepCamelize(v)) as unknown as T;
    if (isPlainObject(input)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(input as Record<string, unknown>)) {
            const val = (input as Record<string, unknown>)[key];
            const newKey = toCamel(key);
            out[newKey] = deepCamelize(val as unknown);
        }
        return out as unknown as T;
    }
    return input;
}

export function deepSnake<T>(input: T): T {
    if (input === null || input === undefined) return input;
    if (Array.isArray(input)) return input.map((v) => deepSnake(v)) as unknown as T;
    if (isPlainObject(input)) {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(input as Record<string, unknown>)) {
            const val = (input as Record<string, unknown>)[key];
            const newKey = toSnake(key);
            out[newKey] = deepSnake(val as unknown);
        }
        return out as unknown as T;
    }
    return input;
}

export default {
    toCamel,
    toSnake,
    deepCamelize,
    deepSnake,
};