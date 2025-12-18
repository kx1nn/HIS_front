// src/services/api.ts
import axios, { type AxiosError } from 'axios';
import type { RegistrationDTO, RegistrationVO, Patient } from '../types';

// 后端原始 DTO（根据后端返回字段定义具体类型，避免使用 `any`）
export type RawDoctor = {
  id: number;
  doctorNo?: string;
  name?: string;
  gender?: number;
  genderText?: string;
  title?: string;
  specialty?: string;
  status?: number; // 0: 停用, 1: 启用
  statusText?: string;
  departmentId?: number; // 所属科室 ID
  departmentName?: string; // 所属科室名称
  registrationFee?: number;
};

export type RawDepartment = {
  id: number;
  code?: string;
  name: string;
  parentId?: number;
  parentName?: string;
  timestamp?: number;
};

// 配置 API 基础地址
// 优先使用环境变量 VITE_API_BASE；开发时若本地代理转发不稳定，
// 允许在本地直接使用公网 tunnel 地址以便调试（仅开发时）。
const ENV_BASE = (import.meta.env.VITE_API_BASE as string) || '';
let API_BASE_URL = ENV_BASE || '/api';
if (!ENV_BASE && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // TODO: 若你更换了 tunnel 地址，请在这里或通过 VITE_API_BASE 覆盖
  API_BASE_URL = 'https://415da3e8.r6.cpolar.cn/api';
  console.info('[api] dev override base URL ->', API_BASE_URL);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

// 从后端响应数据中安全提取 message 字段
function extractMessageFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const msg = d['message'];
  return typeof msg === 'string' ? msg : undefined;
}

/*
// --- 内存数据库 (模拟后端存储) ---
let mockIdCounter = 1;
let mockRegistrations: RegistrationVO[] = [
  {
    id: 999,
    regNo: 'REG20231217001',
    mrn: 'P20230001',
    patientName: '张伟',
    idCard: '110101199001011234',
    gender: 1,
    age: 32,
    phone: '13800138000',
    deptId: 1,
    deptName: '内科',
    doctorId: 101,
    doctorName: '王医生',
    regFee: 20,
    insuranceType: '职工医保',
    type: '初诊',
    status: 0,
    statusDesc: '待诊',
    sequence: 1,
    createTime: '08:30:00'
  }
];

// --- 模拟历史患者库 (用于身份证自动识别) ---
const MOCK_PATIENT_DB = [
  { idCard: '110101199001011234', name: '张伟', gender: 1, age: 33, phone: '13800138000', insuranceType: '职工医保', mrn: 'P20230001' }
];
*/

export const registrationApi = {
  // 1. 提交挂号接口 -> 调用后端真实接口
  create: async (data: RegistrationDTO): Promise<{ success: boolean; data?: RegistrationVO; message?: string }> => {
    try {
      // 后端提供的是 '/api/registrations'，POST 到该路径创建挂号
      const res = await api.post('/registrations', data);
      const d = res?.data;
      // 支持后端常见包装格式 { code, message, data }
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return { success: wrapper.code === 200, data: wrapper.data as RegistrationVO, message: wrapper.message };
      }
      // 支持 { success, data } 格式
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return d as { success: boolean; data?: RegistrationVO; message?: string };
      }
      // 直接返回数据对象
      return { success: true, data: d as RegistrationVO };
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('registrationApi.create error:', e?.response?.status, e?.response?.data, e?.message);
      return { success: false, message: extractMessageFromData(e?.response?.data) || e?.message || '网络请求失败' };
    }
  },
  
  // 2. 获取今日挂号列表
  getList: async (params?: { q?: string; idCard?: string; patientName?: string; phone?: string }): Promise<RegistrationVO[]> => {
    try {
      // GET '/api/registrations' 返回列表，支持查询参数
      const res = await api.get('/registrations', { params });
      const d = res?.data;
      // 支持后端包装格式 { code, message, data }
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (Array.isArray(wrapper.data) ? (wrapper.data as RegistrationVO[]) : []);
      }
      // 支持 { success, data }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return ((d as { success: boolean; data?: unknown }).data as RegistrationVO[]) || [];
      }
      return (Array.isArray(d) ? (d as RegistrationVO[]) : []) || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('registrationApi.getList error:', e?.response?.status, e?.response?.data, e?.message);
      return [];
    }
  },

  // 3. 根据身份证或通用查询查询老患者
  // 参数可以是身份证号/手机号/姓名，函数会智能选择查询参数名
  checkPatient: async (q: string): Promise<Patient | Patient[] | null> => {
    try {
      const isIdCard = typeof q === 'string' && q.trim().length >= 15 && /^[0-9Xx]+$/.test(q.replace(/\s+/g, ''));
      const url = isIdCard
        ? `/patient/check?idCard=${encodeURIComponent(q)}`
        : `/patient/check?q=${encodeURIComponent(q)}`;
      const res = await api.get(url);
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        const maybe = wrapper.data as Patient | Patient[] | null;
        return maybe ?? null;
      }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        const maybe = (d as { success: boolean; data?: unknown }).data as Patient | Patient[] | null;
        return maybe ?? null;
      }
      return (d as Patient | Patient[] | null) ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('registrationApi.checkPatient error:', e?.response?.status, e?.response?.data, e?.message);
      return null;
    }
  }
};

// 患者表相关 API（优先用于在患者表中检索）
export const patientApi = {
  // 根据身份证查找患者（优先从 /patients 或 /patient/list 等接口获取）
  findByIdCard: async (idCard: string): Promise<Patient | Patient[] | null> => {
    try {
      // 尝试常见路径，后端可能在不同路由下实现，优先使用 /patients
      const tryUrls = [`/patients?idCard=${encodeURIComponent(idCard)}`, `/patient/check?idCard=${encodeURIComponent(idCard)}`];
      for (const url of tryUrls) {
        try {
          const res = await api.get(url);
          const d = res?.data;
          if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
            const wrapper = d as { code?: number; message?: string; data?: unknown };
            const maybe = wrapper.data as Patient | Patient[] | null;
            if (maybe) return maybe;
            continue;
          }
          if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
            const maybe = (d as { success: boolean; data?: unknown }).data as Patient | Patient[] | null;
            if (maybe) return maybe;
            continue;
          }
          if (d) return (d as Patient | Patient[] | null);
        } catch (err) {
          // 单个路径失败继续尝试下一个
          console.debug('[patientApi] try url failed', url, err);
        }
      }
      return null;
    } catch (err) {
      console.error('patientApi.findByIdCard error', err);
      return null;
    }
  },

  // 通用查询（姓名/手机号）
  search: async (q: string): Promise<Patient[] | null> => {
    try {
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`);
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (Array.isArray(wrapper.data) ? (wrapper.data as Patient[]) : []) || null;
      }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return ((d as { success: boolean; data?: unknown }).data as Patient[]) || null;
      }
      return (Array.isArray(d) ? (d as Patient[]) : null) || null;
    } catch (err) {
      console.error('patientApi.search error', err);
      return null;
    }
  }
  ,
  // 创建或更新患者（写入患者表）
  create: async (data: Partial<Patient>): Promise<Patient | null> => {
    try {
      const res = await api.post('/patients', data);
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (wrapper.data as Patient) ?? null;
      }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return ((d as { success: boolean; data?: unknown }).data as Patient) ?? null;
      }
      return (d as Patient) ?? null;
    } catch (err) {
      console.error('patientApi.create error', err);
      return null;
    }
  }
};

// 基础数据 API：医生与科室
export const basicApi = {
  getDoctors: async (deptId?: number): Promise<RawDoctor[]> => {
    try {
      const url = deptId ? `/basic/doctors?deptId=${encodeURIComponent(String(deptId))}` : '/basic/doctors';
      const res = await api.get(url);
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (Array.isArray(wrapper.data) ? (wrapper.data as RawDoctor[]) : []);
      }
      return (Array.isArray(d) ? (d as RawDoctor[]) : []);
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('basicApi.getDoctors error:', e?.response?.status, e?.response?.data, e?.message);
      return [];
    }
  },

  getDepartments: async (): Promise<RawDepartment[]> => {
    try {
      const res = await api.get('/basic/departments');
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (Array.isArray(wrapper.data) ? (wrapper.data as RawDepartment[]) : []);
      }
      return (Array.isArray(d) ? (d as RawDepartment[]) : []);
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('basicApi.getDepartments error:', e?.response?.status, e?.response?.data, e?.message);
      return [];
    }
  }
};