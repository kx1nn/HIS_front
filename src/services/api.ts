// src/services/api.ts
import axios, { type AxiosError } from 'axios';
import type { RegistrationDTO, RegistrationVO } from '../types';

// 配置 API 基础地址
// 开发时推荐使用代理：在 `vite.config.ts` 中将 '/api' 代理到后端公网地址，
// 并将下面的 baseURL 设为 '/api' 或通过 VITE_API_BASE 覆盖。
const API_BASE_URL = (import.meta.env.VITE_API_BASE as string) || '/api';

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
  getList: async (): Promise<RegistrationVO[]> => {
    try {
      // GET '/api/registrations' 返回列表
      const res = await api.get('/registrations');
      const d = res?.data;
      // 支持后端包装格式 { code, message, data }
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (Array.isArray(wrapper.data) ? wrapper.data : []) as RegistrationVO[];
      }
      // 支持 { success, data }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return ((d as { success: boolean; data?: unknown }).data as RegistrationVO[]) || [];
      }
      return (d as RegistrationVO[]) || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('registrationApi.getList error:', e?.response?.status, e?.response?.data, e?.message);
      return [];
    }
  },

  // 3. 根据身份证查询老患者
  checkPatient: async (idCard: string) => {
    try {
      const res = await api.get(`/patient/check?idCard=${encodeURIComponent(idCard)}`);
      const d = res?.data;
      if (d && typeof d === 'object' && 'code' in (d as Record<string, unknown>)) {
        const wrapper = d as { code?: number; message?: string; data?: unknown };
        return (wrapper.data as unknown) || null;
      }
      if (d && typeof d === 'object' && 'success' in (d as Record<string, unknown>)) {
        return (d as { success: boolean; data?: unknown }).data || null;
      }
      return d || null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('registrationApi.checkPatient error:', e?.response?.status, e?.response?.data, e?.message);
      return null;
    }
  }
};