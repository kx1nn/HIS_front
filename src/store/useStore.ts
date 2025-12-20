// src/store/useStore.ts
import { create } from 'zustand';
import type { User, Doctor, Department } from '../types';

export interface AppState {
  // 用户状态
  user: User | null;
  login: (user: User) => void;
  logout: () => void;

  // 主数据 (模拟数据库)
  doctors: Doctor[];
  departments: Department[];
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
import { getUser, setUser as __setUser, removeUser as __removeUser } from '../services/authStorage';
const initialUser = getUser() as User | null;

export const useStore = create<AppState>((set) => ({
  user: initialUser,
  doctors: MOCK_DOCTORS,
  departments: MOCK_DEPTS,

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