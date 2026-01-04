// src/store/useStore.ts
import { create } from 'zustand';
import type { User, Doctor, Department } from '../types';

export interface AppState {
  /**
   * 全局应用状态（Zustand store）
   * 包含用户、token、通知与主数据等
   */
  // 用户状态
  user: User | null;
  token: string | null;
  login: (user: User) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  // 通用通知（弹出卡片）
  notifications: Array<{ id: number; type?: 'info' | 'success' | 'error' | 'warn'; message: string }>;
  notify: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  removeNotification: (id: number) => void;

  // 主数据
  doctors: Doctor[];
  departments: Department[];
  setDoctors: (ds: Doctor[]) => void;
  setDepartments: (ds: Department[]) => void;
}

// 主数据（初始为空，需由后端或初始化流程填充）
const INITIAL_DEPTS: Department[] = [];
const INITIAL_DOCTORS: Doctor[] = [];

// --- 尝试从本地存储恢复登录状态 ---
import { getUser, getToken, setUser as __setUser, setToken as __setToken, removeUser as __removeUser, removeToken as __removeToken } from '../services/authStorage';
const initialUser = getUser() as User | null;
const initialToken = getToken();

/**
 * 创建并导出全局状态 Hook（Zustand）
 * 使用示例：const { user, notify } = useStore();
 */
export const useStore = create<AppState>((set) => ({
  user: initialUser,
  token: initialToken,
  doctors: INITIAL_DOCTORS,
  departments: INITIAL_DEPTS,

  setDoctors: (ds: Doctor[]) => set({ doctors: ds }),
  setDepartments: (ds: Department[]) => set({ departments: ds }),

  // 登录动作
  login: (user) => {
    __setUser(user);
    set({ user });
  },
  // 通知实现
  notifications: [],
  notify: (message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set((s) => ({ notifications: [...s.notifications, { id, type, message }] }));
    // 自动清除
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) }));
    }, 4500);
  },
  removeNotification: (id: number) => set((s) => ({ notifications: s.notifications.filter(n => n.id !== id) })),
  setToken: (token) => {
    __setToken(token);
    set({ token });
  },

  // 退出动作
  logout: () => {
    __removeUser();
    __removeToken();
    set({ user: null, token: null });
  },
}));