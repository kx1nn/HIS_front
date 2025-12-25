// src/services/api.ts
import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig, type AxiosInstance, type AxiosResponse } from 'axios';
import { getToken, setToken } from '../services/authStorage';
import { useStore } from '../store/store';
import * as logger from './logger';
import type { RegistrationDTO, RegistrationVO, Patient, MedicalRecord, Drug, PrescriptionVO, MedicalRecordVO } from '../types';

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

// 业务接口实例 (带 /api 前缀)
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

// 认证接口实例 (不带 /api 前缀)
export const authInstance = axios.create({
  baseURL: ENV_BASE || '/',
  timeout: 5000,
});

// 统一请求拦截器
const requestInterceptor = (config: InternalAxiosRequestConfig) => {
  try {
    const token = getToken();
    if (token && config) {
      // 确保 headers 对象存在（有些调用传入的 config 可能不包含 headers）
      if (!config.headers) config.headers = {} as InternalAxiosRequestConfig['headers'];
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }
  return config;
};

api.interceptors.request.use(requestInterceptor);
authInstance.interceptors.request.use(requestInterceptor);

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

// 全局响应错误拦截
const responseErrorInterceptor = (instance: AxiosInstance) => (error: AxiosError) => {
  try {
    const status = error.response?.status;
    const url = (error.config as AxiosRequestConfig | undefined)?.url ?? '';
    const isLoginRequest = typeof url === 'string' && url.includes('/auth/login');

    if (!isLoginRequest && (status === 403 || status === 404)) {
      logger.error('api.interceptor', error);
    }

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
              resolve(instance(originalRequest));
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
            // 刷新接口通常在 auth 下
            const refreshRes = await authInstance.post('/auth/refresh');
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
              resolve(instance(originalRequest));
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
    logger.error('api.interceptor', e);
  }
  return Promise.reject(error);
};

api.interceptors.response.use(res => res, responseErrorInterceptor(api));
authInstance.interceptors.response.use(res => res, responseErrorInterceptor(authInstance));

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
      const res = await authInstance.post('/auth/login', payload);
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
      const res = await authInstance.post('/auth/logout');
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
      const res = await authInstance.get('/auth/validate');
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
      // 新后端路径优先：/api/nurse/registrations
      try {
        const res = await api.post('/api/nurse/registrations', data);
        const norm = normalizeResponse<RegistrationVO>(res?.data);
        return { success: norm.success, data: norm.data, message: norm.message };
      } catch (e) {
        logger.debug('registrationApi.create: new endpoint failed, fallback to /registrations', e);
      }
      const res = await api.post('/api/registrations', data);
      const norm = normalizeResponse<RegistrationVO>(res?.data);
      return { success: norm.success, data: norm.data, message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.create', e);
      return { success: false, message: mapStatusToMessage(e) || '网络请求失败' };
    }
  },

  // 2. 获取今日挂号列表（护士工作台）
  getList: async (params?: { visitDate?: string; departmentId?: number; status?: number; visitType?: number; keyword?: string }, config?: AxiosRequestConfig): Promise<RegistrationVO[]> => {
    try {
      // POST '/api/nurse/registrations/today'，body 支持筛选条件
      const res = await api.post('/api/nurse/registrations/today', params ?? {}, { ...(config ?? {}) });
      const norm = normalizeResponse<RegistrationVO[]>(res?.data);
      if (norm.data) return norm.data;
      if (Array.isArray(res?.data)) return res?.data as RegistrationVO[];
      return [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.getList', e);
      return [];
    }
  },

  // 3. 根据挂号记录ID查询详细信息
  getById: async (id: number, config?: AxiosRequestConfig): Promise<RegistrationVO | null> => {
    try {
      try {
        const res = await api.get(`/api/nurse/registrations/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
        const norm = normalizeResponse<RegistrationVO>(res?.data);
        if (norm.data) return norm.data;
      } catch (e) {
        logger.debug('registrationApi.getById: new endpoint failed, fallback to /registrations/{id}', e);
      }
      const res2 = await api.get(`/api/registrations/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
      const norm2 = normalizeResponse<RegistrationVO>(res2?.data);
      return norm2.data ?? null;
    } catch (err: unknown) {
      logApiError('registrationApi.getById', err as AxiosError);
      return null;
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
  },
  // 4. 取消挂号
  cancel: async (id: number, reason?: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // 后端要求 application/x-www-form-urlencoded，使用 URLSearchParams
      const body = new URLSearchParams();
      if (reason) body.append('reason', reason);
      const res = await api.put(`/registrations/${id}/cancel`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const norm = normalizeResponse<unknown>(res?.data);
      return { success: Boolean(norm.success ?? true), message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.cancel', e);
      return { success: false, message: mapStatusToMessage(e) || '取消失败' };
    }
  },
  // 5. 挂号退费
  refund: async (id: number): Promise<{ success: boolean; message?: string }> => {
    try {
      // 后端要求 application/x-www-form-urlencoded，即使无 body，也传空字符串
      const res = await api.put(`/registrations/${id}/refund`, '', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const norm = normalizeResponse<unknown>(res?.data);
      return { success: Boolean(norm.success ?? true), message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('registrationApi.refund', e);
      return { success: false, message: mapStatusToMessage(e) || '退费失败' };
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
      // 使用新的公共接口：/api/common/data/doctors
      const url = deptId ? `/api/common/data/doctors?deptId=${encodeURIComponent(String(deptId))}` : '/api/common/data/doctors';
      const res = await api.get(url, { ...(config ?? {}) });
      const norm = normalizeResponse<RawDoctor[]>(res?.data);
      if (norm.data) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as RawDoctor[]) : [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('basicApi.getDoctors', e);
      return [];
    }
  },

  getDepartments: async (): Promise<RawDepartment[]> => {
    try {
      // 使用新的公共接口：/api/common/data/departments
      const res = await api.get('/api/common/data/departments');
      const norm = normalizeResponse<RawDepartment[]>(res?.data);
      if (norm.data) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as RawDepartment[]) : [];
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
      const res = await api.get('/common/medicines/search', { ...(config ?? {}), params: { keyword, lowStock } });
      const norm = normalizeResponse<Drug[]>(res?.data);
      if (norm.data) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as Drug[]) : [];
    } catch (err) {
      logApiError('pharmacyApi.getDrugs', err as AxiosError);
      return [];
    }
  },

  // 获取待发药处方列表
  getPendingPrescriptions: async (config?: AxiosRequestConfig): Promise<PrescriptionVO[]> => {
    try {
      const res = await api.get('/medicine/pending', { ...(config ?? {}) });
      const norm = normalizeResponse<PrescriptionVO[]>(res?.data);
      if (norm.data) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as PrescriptionVO[]) : [];
    } catch (err) {
      logApiError('pharmacyApi.getPendingPrescriptions', err as AxiosError);
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

  // 根据药品ID查询详情（公共接口）
  getById: async (id: number, config?: AxiosRequestConfig): Promise<Drug | null> => {
    try {
      const res = await api.get(`/common/medicines/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
      const norm = normalizeResponse<Drug>(res?.data);
      if (norm.data) return norm.data;
      if (res?.data && typeof res?.data === 'object') {
        const obj = res?.data as Record<string, unknown>;
        return (obj['data'] as Drug) ?? (res?.data as Drug) ?? null;
      }
      return null;
    } catch (err) {
      logApiError('pharmacyApi.getById', err as AxiosError);
      return null;
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

  // 医生/系统推送处方到药房
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
      // 合并 config.params（例如 doctorId/deptId）和 showAll 标志
      const params = { ...(config?.params ?? {}), showAll } as Record<string, unknown>;
      const res = await api.get(`/api/doctor/waiting-list`, { ...(config ?? {}), params });
      const norm = normalizeResponse<RegistrationVO[]>(res?.data);
      // 后端可能返回 HTTP 200 但 body 包含 { code: 401, message: '认证失败' }
      // 将这类业务错误提升为异常，便于上层统一处理（例如触发跳转登录）
      if (!norm.success) {
        const apiErr = new Error(norm.message || 'api error') as unknown as AxiosError & { response?: AxiosResponse };
        // attach the full Axios response so callers can inspect status/data
        if (res) apiErr.response = res as AxiosResponse;
        throw apiErr;
      }

      const list = norm.data || [];
      // 映射后端字段到前端 RegistrationVO 结构，防止字段缺失导致页面崩溃
      return list.map((item: Partial<RegistrationVO>) => ({
        ...item,
        // 优先使用 sequence，如果没有则尝试从 queueNo 解析数字
        sequence: item.sequence ?? (item.queueNo ? parseInt(item.queueNo.replace(/\D/g, '') || '0') : 0),
        // 优先使用 createTime，如果没有则使用 createdAt，再没有则当前时间
        createTime: item.createTime ?? item.createdAt ?? new Date().toISOString(),
        // 补充缺失的必填字段默认值
        insuranceType: item.insuranceType ?? '自费',
        mrn: item.mrn ?? item.regNo ?? '',
        type: item.type ?? '普通门诊',
        gender: item.gender ?? 2,
        age: item.age ?? 0,
        patientName: item.patientName ?? '未知患者',
      })) as RegistrationVO[];

    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getWaitingList', e);
      // 如果是取消请求则静默返回，否则将错误抛出以便上层组件决定如何处理（例如 401 跳转）
      if (isCanceledError(e)) return [];
      throw e;
    }
  },

  // 更新挂号状态，path: /doctor/registrations/{id}/status?status=...
  updateRegistrationStatus: async (id: number, status: number): Promise<boolean> => {
    try {
      const res = await api.put(`/api/doctor/registrations/${encodeURIComponent(String(id))}/status`, null, { params: { status } });
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.updateRegistrationStatus', e);
      return false;
    }
  },

  // 根据病历ID查询详细信息
  getMedicalRecordDetail: async (id: number): Promise<MedicalRecordVO | null> => {
    try {
      const res = await api.get(`/api/doctor/medical-records/${encodeURIComponent(String(id))}`);
      const norm = normalizeResponse<MedicalRecordVO>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getMedicalRecordDetail', e);
      return null;
    }
  },

  // 查询患者历史病历列表 (猜测接口，优先尝试 /api/doctor/medical-records?patientId=...)
  getPatientHistory: async (patientId: number): Promise<MedicalRecordVO[]> => {
    try {
      const res = await api.get(`/api/doctor/medical-records`, { params: { patientId } });
      const norm = normalizeResponse<MedicalRecordVO[]>(res?.data);
      if (norm.data) return norm.data;
      return [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getPatientHistory', e);
      return [];
    }
  }
};