// src/services/api.ts
import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import { getToken, setToken } from '../services/authStorage';
import { useStore } from '../store/store';
import * as logger from './logger';
import type { RegistrationDTO, RegistrationVO, Patient, MedicalRecord, Drug, PrescriptionVO } from '../types';

// 后端原始 DTO
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

const ENV_BASE = (import.meta.env.VITE_API_BASE as string) || '';
const API_BASE_URL = ENV_BASE || '/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

// 在每次请求前自动注入 Authorization header
api.interceptors.request.use((config) => {
  try {
    const token = getToken();
    if (token && config && config.headers) {
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return config;
});

// 401 刷新队列：避免并发刷新导致重复登出/重复刷新
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];
function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}
function onRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// 全局响应错误拦截：对特定状态码给出友好提示，并在 401 时尝试刷新
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    try {
      const status = error.response?.status;
      const url = (error.config as AxiosRequestConfig | undefined)?.url ?? '';
      const isLoginRequest = typeof url === 'string' && url.includes('/auth/login');

      // 对 403 和 404 统一记录为系统错误（由页面决定是否展示提示），避免重复通知
      if (!isLoginRequest && (status === 403 || status === 404)) {
        logger.error('api.interceptor', error);
      }

      // 处理 401：尝试刷新 token 并重试原请求
      if (status === 401 && !isLoginRequest) {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (!originalRequest) return Promise.reject(error);
        if (originalRequest._retry) return Promise.reject(error);
        originalRequest._retry = true;

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((token) => {
              if (token) {
                if (originalRequest.headers) (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
                resolve(api(originalRequest));
              } else {
                reject(error);
              }
            });
          });
        }

        isRefreshing = true;
        return new Promise((resolve, reject) => {
          (async () => {
            try {
              // 尝试刷新 token（后端需实现 /auth/refresh 或等效接口）
              const refreshRes = await api.post('/auth/refresh');
              const norm = normalizeResponse<{ token?: string }>(refreshRes?.data);
              const newToken = norm.data?.token ?? null;
              if (newToken) {
                setToken(newToken);
                try {
                  useStore.getState().setToken(newToken);
                } catch (e) {
                  logger.warn('useStore update failed after refresh', e);
                }
                onRefreshed(newToken);
                if (originalRequest.headers) (originalRequest.headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
                resolve(api(originalRequest));
              } else {
                onRefreshed(null);
                try { useStore.getState().logout(); } catch (e) { logger.warn('logout failed after refresh failure', e); }
                reject(error);
              }
            } catch (e) {
              onRefreshed(null);
              try { useStore.getState().logout(); } catch (err) { logger.warn('logout failed after refresh exception', err); }
              reject(e);
            } finally {
              isRefreshing = false;
            }
          })();
        });
      }
    } catch (e) {
      // 忽略拦截器内部错误，但记录以便排查
      logger.error('api.interceptor', e);
    }
    return Promise.reject(error);
  }
);

// 从后端响应数据中安全提取 message 字段
function extractMessageFromData(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const msg = d['message'];
  return typeof msg === 'string' ? msg : undefined;
}

function mapStatusToMessage(err: unknown): string | undefined {
  const e = err as AxiosError | undefined;
  const status = e?.response?.status;
  if (status === 403 || status === 404) return '系统错误，请联系管理员处理';
  if (status === 401) return '账号或密码错误，请重新登录';
  if (status === 500) return '服务器错误，请稍后重试';
  const msg = extractMessageFromData(e?.response?.data);
  if (msg) return msg;
  if (e?.message) return e.message;
  return undefined;
}

// 统一响应解析器：识别常见后端包装 {code,message,data} 或 {success,data,message}
function normalizeResponse<T>(data: unknown): { success: boolean; data?: T; message?: string } {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if ('code' in d) {
      const code = Number(d['code'] as unknown) || 0;
      return { success: code === 0 || code === 200, data: d['data'] as T, message: typeof d['message'] === 'string' ? (d['message'] as string) : undefined };
    }
    if ('success' in d) {
      return { success: Boolean(d['success']), data: d['data'] as T, message: typeof d['message'] === 'string' ? (d['message'] as string) : undefined };
    }
  }
  return { success: true, data: data as T };
}

// 统一错误记录，便于后续更改为上报
export function logApiError(tag: string, err: unknown) {
  const e = err as AxiosError | undefined;
  logger.error(`${tag} error:`, e?.response?.status, e?.response?.data, e?.message);
}

// 导出一个辅助函数，便于组件创建取消控制器并在卸载时中止请求
export function makeAbortController(): AbortController {
  return new AbortController();
}

// 判断是否为请求被取消（Abort/axios cancel）
export function isCanceledError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  const name = o['name'];
  const code = o['code'];
  return (typeof name === 'string' && name === 'CanceledError') || (typeof code === 'string' && code === 'ERR_CANCELED');
}

// --- 认证相关 API ---
export type LoginRequest = { username: string; password: string };
export type LoginVO = { token: string; role?: string; realName?: string; userId?: number; relatedId?: number };

export const authApi = {
  login: async (payload: LoginRequest): Promise<{ success: boolean; data?: LoginVO; message?: string }> => {
    try {
      const res = await api.post('/auth/login', payload);
      const norm = normalizeResponse<LoginVO>(res?.data);
      return { success: norm.success, data: norm.data, message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('authApi.login', e);
      return { success: false, message: mapStatusToMessage(e) || '网络请求失败' };
    }
  },

  logout: async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await api.post('/auth/logout');
      const norm = normalizeResponse<unknown>(res?.data);
      return { success: norm.success, message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('authApi.logout', e);
      return { success: false, message: mapStatusToMessage(e) || '网络请求失败' };
    }
  },

  validate: async (): Promise<boolean> => {
    try {
      const res = await api.get('/auth/validate');
      const norm = normalizeResponse<unknown>(res?.data);
      return Boolean(norm.data);
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('authApi.validate', e);
      return false;
    }
  }
};


export const registrationApi = {
  // 1. 提交挂号接口
  create: async (data: RegistrationDTO): Promise<{ success: boolean; data?: RegistrationVO; message?: string }> => {
    try {
      // 后端提供的是 '/api/registrations'，POST 到该路径创建挂号
      const res = await api.post('/registrations', data);
      const norm = normalizeResponse<RegistrationVO>(res?.data);
      return { success: norm.success, data: norm.data, message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.create', e);
      return { success: false, message: mapStatusToMessage(e) || '网络请求失败' };
    }
  },

  // 2. 获取今日挂号列表
  getList: async (params?: { q?: string; idCard?: string; patientName?: string; phone?: string }, config?: AxiosRequestConfig): Promise<RegistrationVO[]> => {
    try {
      // GET '/api/registrations' 返回列表，支持查询参数
      const res = await api.get('/registrations', { ...(config ?? {}), params });
      const norm = normalizeResponse<RegistrationVO[]>(res?.data);
      return norm.data || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.getList', e);
      return [];
    }
  },

  // 3. 根据身份证或通用查询查询老患者
  // 参数可以是身份证号/手机号/姓名，函数会智能选择查询参数名
  checkPatient: async (q: string, config?: AxiosRequestConfig): Promise<Patient | Patient[] | null> => {
    try {
      const isIdCard = typeof q === 'string' && q.trim().length >= 15 && /^[0-9Xx]+$/.test(q.replace(/\s+/g, ''));
      const url = isIdCard
        ? `/patient/check?idCard=${encodeURIComponent(q)}`
        : `/patient/check?q=${encodeURIComponent(q)}`;
      const res = await api.get(url, { ...(config ?? {}) });
      const norm = normalizeResponse<Patient | Patient[] | null>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.checkPatient', e);
      return null;
    }
  }
};

// 患者表相关 API（优先用于在患者表中检索）
export const patientApi = {
  // 根据身份证查找患者（优先从 /patients 或 /patient/list 等接口获取）
  findByIdCard: async (idCard: string, config?: AxiosRequestConfig): Promise<Patient | Patient[] | null> => {
    try {
      // 尝试常见路径，后端可能在不同路由下实现，优先使用 /patients
      const tryUrls = [`/patients?idCard=${encodeURIComponent(idCard)}`, `/patient/check?idCard=${encodeURIComponent(idCard)}`];
      for (const url of tryUrls) {
        try {
          const res = await api.get(url, { ...(config ?? {}) });
          const norm = normalizeResponse<Patient | Patient[] | null>(res?.data);
          if (norm.data) return norm.data;
          continue;
        } catch (e) {
          // 单个路径失败继续尝试下一个
          logger.debug('[patientApi] try url failed', url, e);
        }
      }
      return null;
    } catch (err) {
      logApiError('patientApi.findByIdCard', err);
      return null;
    }
  },

  // 通用查询（姓名/手机号）
  search: async (q: string): Promise<Patient[] | null> => {
    try {
      const res = await api.get(`/patients/search?q=${encodeURIComponent(q)}`);
      const norm = normalizeResponse<Patient[]>(res?.data);
      return norm.data || null;
    } catch (err) {
      logApiError('patientApi.search', err);
      return null;
    }
  }
  ,
  // 创建或更新患者（写入患者表）
  create: async (data: Partial<Patient>): Promise<Patient | null> => {
    try {
      const res = await api.post('/patients', data);
      const norm = normalizeResponse<Patient>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('patientApi.create', err);
      return null;
    }
  }
};

// 基础数据 API：医生与科室
export const basicApi = {
  getDoctors: async (deptId?: number, config?: AxiosRequestConfig): Promise<RawDoctor[]> => {
    try {
      const url = deptId ? `/basic/doctors?deptId=${encodeURIComponent(String(deptId))}` : '/basic/doctors';
      const res = await api.get(url, { ...(config ?? {}) });
      const norm = normalizeResponse<RawDoctor[]>(res?.data);
      return norm.data || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('basicApi.getDoctors', e);
      return [];
    }
  },

  getDepartments: async (): Promise<RawDepartment[]> => {
    try {
      const res = await api.get('/basic/departments');
      const norm = normalizeResponse<RawDepartment[]>(res?.data);
      return norm.data || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('basicApi.getDepartments', e);
      return [];
    }
  }
};
// --- 药房 API ---
export const pharmacyApi = {
  // 查询库存（支持关键字/低库存筛选）
  getDrugs: async (keyword?: string, lowStock?: boolean, config?: AxiosRequestConfig): Promise<Drug[]> => {
    try {
      const res = await api.get('/medicine/stock', { ...(config ?? {}), params: { keyword, lowStock } });
      const norm = normalizeResponse<Drug[]>(res?.data);
      return norm.data || [];
    } catch (err) {
      logApiError('pharmacyApi.getDrugs', err as AxiosError);
      return [];
    }
  },

  // 获取待发药处方（若后端提供对应接口可替换）
  getPendingPrescriptions: async (config?: AxiosRequestConfig): Promise<PrescriptionVO[]> => {
    try {
      // 尝试后端常见路径
      const tryUrls = ['/medicine/pending', '/prescriptions/pending', '/prescriptions?status=pending'];
      for (const url of tryUrls) {
        try {
          const res = await api.get(url, { ...(config ?? {}) });
          const norm = normalizeResponse<PrescriptionVO[]>(res?.data);
          if (norm.data) return norm.data;
          if (Array.isArray(res?.data)) return res?.data as PrescriptionVO[];
        } catch {
          // continue
        }
      }
      // 未获取到后端数据，返回空列表
      return [];
    } catch (err) {
      logApiError('pharmacyApi.getPendingPrescriptions', err);
      return [];
    }
  },

  // 根据处方ID发药（扣减库存）
  dispense: async (prescriptionId: number): Promise<boolean> => {
    try {
      const res = await api.post('/medicine/dispense', null, { params: { prescriptionId } });
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err) {
      logApiError('pharmacyApi.dispense', err);
      return false;
    }
  },

  // 退药操作（根据发药记录ID）
  returnMedicine: async (dispenseId: number, reason: string): Promise<boolean> => {
    try {
      const res = await api.post('/medicine/return', null, { params: { dispenseId, reason } });
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err) {
      logApiError('pharmacyApi.returnMedicine', err);
      return false;
    }
  },

  // 今日发药统计
  getTodayStatistics: async (): Promise<unknown | null> => {
    try {
      const res = await api.get('/medicine/statistics/today');
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('pharmacyApi.getTodayStatistics', err);
      return null;
    }
  },

  // 医生/系统推送处方到药房（保持原有 mock 支持）
  sendPrescription: async (rx: PrescriptionVO): Promise<boolean> => {
    try {
      const res = await api.post('/prescriptions', rx);
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err) {
      logApiError('pharmacyApi.sendPrescription', err);
      return false;
    }
  }
};

// --- 病历 API ---
export const medicalRecordApi = {
  // 根据挂号单ID查询病历
  getByRegistrationId: async (regId: number): Promise<MedicalRecord | null> => {
    try {
      const res = await api.get(`/medical-records`, { params: { regId } });
      const norm = normalizeResponse<MedicalRecord | MedicalRecord[] | null>(res?.data);
      if (Array.isArray(norm.data) && norm.data.length > 0) return norm.data[0] as MedicalRecord;
      if (norm.data && !Array.isArray(norm.data)) return norm.data as MedicalRecord;
      return null;
    } catch (err) {
      logApiError('medicalRecordApi.getByRegistrationId', err);
      return null;
    }
  },
  // 保存病历
  save: async (record: MedicalRecord): Promise<boolean> => {
    try {
      // 如果存在主键则更新，否则创建
      const rec = record as MedicalRecord;
      if (rec.main_id) {
        const res = await api.put(`/medical-records/${encodeURIComponent(String(rec.main_id))}`, record);
        const norm = normalizeResponse<unknown>(res?.data);
        return norm.success;
      }
      const res = await api.post('/medical-records', record);
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err) {
      logApiError('medicalRecordApi.save', err);
      return false;
    }
  }
};

// --- 医生相关 API ---
export const doctorApi = {
  // 获取医生候诊列表，showAll=true 返回科室全部候诊
  getWaitingList: async (showAll = false, config?: AxiosRequestConfig): Promise<RegistrationVO[]> => {
    try {
      const res = await api.get(`/doctor/waiting-list`, { ...(config ?? {}), params: { showAll } });
      const norm = normalizeResponse<RegistrationVO[]>(res?.data);
      return norm.data || [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getWaitingList', e);
      return [];
    }
  },

  // 更新挂号状态，path: /doctor/registrations/{id}/status?status=...
  updateRegistrationStatus: async (id: number, status: number): Promise<boolean> => {
    try {
      const res = await api.put(`/doctor/registrations/${encodeURIComponent(String(id))}/status`, null, { params: { status } });
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.updateRegistrationStatus', e);
      return false;
    }
  }
};