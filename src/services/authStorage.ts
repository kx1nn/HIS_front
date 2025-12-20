// src/services/authStorage.ts
// 集中管理本地与用户/令牌的读写，便于未来切换到更安全的存储策略
export const TOKEN_KEY = 'his_token';
export const USER_KEY = 'his_user';

export function getToken(): string | null {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(token: string | null): void {
    try {
        if (token) localStorage.setItem(TOKEN_KEY, token);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        // ignore
    }
}

export function removeToken(): void {
    setToken(null);
}

export function getUser(): unknown | null {
    try {
        const s = localStorage.getItem(USER_KEY);
        return s ? JSON.parse(s) : null;
    } catch {
        return null;
    }
}

export function setUser(user: unknown | null): void {
    try {
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(USER_KEY);
    } catch {
        // ignore
    }
}

export function removeUser(): void {
    setUser(null);
}

export default { getToken, setToken, removeToken, getUser, setUser, removeUser };
