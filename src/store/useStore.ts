// src/store/useStore.ts
import { create } from 'zustand';
import type { User, Doctor, Department } from '../types';

export interface AppState {
  // 用户状态
  user: User | null;
  login: (user: User) => void;
  logout: () => void;

  // 主数据
  doctors: Doctor[];
  departments: Department[];
}

// 主数据（初始为空，需由后端或初始化流程填充）
const INITIAL_DEPTS: Department[] = [];
const INITIAL_DOCTORS: Doctor[] = [];

// --- 尝试从本地存储恢复登录状态 ---
import { getUser, setUser as __setUser, removeUser as __removeUser } from '../services/authStorage';
const initialUser = getUser() as User | null;

export const useStore = create<AppState>((set) => ({
  user: initialUser,
  doctors: INITIAL_DOCTORS,
  departments: INITIAL_DEPTS,

  // 登录动作
  login: (user) => {
    __setUser(user);
    set({ user });
  },

  // 退出动作
  logout: () => {
    __removeUser();
    set({ user: null });
  },
}));