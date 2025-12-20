// src/store/useStore.ts
import { create } from 'zustand';
import type { User, Doctor, Department } from '../types';

export interface AppState {
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

  // 主数据 (模拟数据库)
  doctors: Doctor[];
  departments: Department[];
  setDoctors: (ds: Doctor[]) => void;
  setDepartments: (ds: Department[]) => void;
}

// --- 模拟的基础数据 (可以直接使用) ---
const MOCK_DEPTS: Department[] = [
  { id: 1, name: '内科' },
  { id: 2, name: '外科' },
  { id: 3, name: '儿科' },
  { id: 4, name: '骨科' },
];

const MOCK_DOCTORS: Doctor[] = [
  { id: 101, name: '王医生', deptId: 1, deptName: '内科', title: '主任医师', isWorking: true },
  { id: 102, name: '李医生', deptId: 1, deptName: '内科', title: '住院医师', isWorking: true },
  { id: 201, name: '赵医生', deptId: 2, deptName: '外科', title: '副主任医师', isWorking: true },
  { id: 301, name: '刘医生', deptId: 3, deptName: '儿科', title: '主治医师', isWorking: false }, // 休息中
];

// --- 尝试从本地存储恢复登录状态 ---
import { getUser, getToken, setUser as __setUser, setToken as __setToken, removeUser as __removeUser, removeToken as __removeToken } from '../services/authStorage';
const initialUser = getUser() as User | null;
const initialToken = getToken();

export const useStore = create<AppState>((set) => ({
  user: initialUser,
  token: initialToken,
  doctors: MOCK_DOCTORS,
  departments: MOCK_DEPTS,

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