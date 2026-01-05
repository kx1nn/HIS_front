// src/services/api.ts
import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig, type AxiosInstance, type AxiosResponse } from 'axios';
import { getToken, setToken } from '../services/authStorage';
import { useStore } from '../store/store';
import * as logger from './logger';
import { deepCamelize, deepSnake } from '../utils/casing';
/*
 * 全局请求/响应字段命名转换说明：
 * - 目的：统一处理后端命名差异（snake_case vs camelCase），简化页面逻辑，所有页面使用 camelCase 类型。
 * - 实现位置：在请求拦截器（requestInterceptor）中对 params 和 JSON body 做 deepSnake（转换为 snake_case），
 *   在响应拦截器中对 JSON body 做 deepCamelize（转换为 camelCase）。
 * - 例外：
 *   - 跳过 FormData、文件上传和 application/x-www-form-urlencoded（因为这些格式常由后端要求并且不可/不应被深度转换）。
 *   - 跳过非 JSON 响应（如登录接口可能返回 text），保持原始响应以便兼容。
 * - 测试：项目包含集成测试与请求转换测试（参见 `src/__tests__`），模拟后端返回 snake_case 并验证前端正确 camelize。
 */
import type { RegistrationDTO, RegistrationVO, Patient, MedicalRecord, Drug, PrescriptionVO, MedicalRecordVO, MedicineVO, PatientDetailVO, MedicalRecordDTO, CreateChargeDTO, PaymentDTO, RefundRequest, ChargeVO, DailySettlementVO, PageChargeVO, InventoryStatsVO, PharmacistStatisticsDTO, AuditLogEntity, PageAuditLogEntity } from '../types';

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
// 开发环境使用相对路径（通过 Vite 代理），生产环境使用完整 URL
const IS_DEV = import.meta.env.DEV;
const API_BASE_URL = IS_DEV ? '/api' : (ENV_BASE ? `${ENV_BASE.replace(/\/$/, '')}/api` : '/api');
// 登录接口：优先使用环境变量地址（开发时也直接指向后端，临时避免代理问题）
// 如果想恢复通过 Vite 代理，请将 AUTH_BASE_URL 设置为空字符串并重启 dev server
const AUTH_BASE_URL = (ENV_BASE ? ENV_BASE.replace(/\/$/, '') : '');

// 业务接口实例 (带 /api 前缀)
/**
 * 主要的 Axios 实例，用于常规业务请求（带 /api 前缀）
 * 会自动在请求拦截器中注入 Authorization
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

/**
 * 认证专用的 Axios 实例（用于登录/刷新等不带 /api 前缀的认证接口）
 */
export const authInstance = axios.create({
  baseURL: AUTH_BASE_URL,
  timeout: 5000,
});

// 统一请求拦截器
const requestInterceptor = (config: InternalAxiosRequestConfig) => {
  try {
    const token = getToken();
    if (config && !config.headers) config.headers = {} as InternalAxiosRequestConfig['headers'];

    // 注入 JWT Authorization
    if (token && config) {
      (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    // 注入 CSRF token（如果 cookie 中存在 __RequestVerificationToken）
    try {
      if (typeof document !== 'undefined' && document.cookie) {
        const m = document.cookie.match(/(?:^|; )__RequestVerificationToken=([^;]+)/);
        const csrf = m ? decodeURIComponent(m[1]) : null;
        if (csrf && config) {
          const h = config.headers as Record<string, string>;
          h['RequestVerificationToken'] = csrf;
          h['X-CSRF-TOKEN'] = csrf;
          h['X-XSRF-TOKEN'] = csrf;
          h['X-CSRFToken'] = csrf;
          // 有些后端还会检查 X-Requested-With
          h['X-Requested-With'] = 'XMLHttpRequest';
        }

        // 将当前登录角色注入 header，方便后端或 mock 按角色控制字段可见性
        try {
          const role = useStore.getState().user?.role ?? null;
          if (role && config) (config.headers as Record<string, string>)['x-user-role'] = String(role).toUpperCase();
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore cookie parsing errors
    }
  } catch {
    // ignore overall errors
  }

  // transform outgoing params/data to snake_case for backend compatibility
  try {
    if (config.params && typeof config.params === 'object') {
      (config as AxiosRequestConfig).params = deepSnake(config.params);
    }
    const headers = (config.headers || {}) as Record<string, string>;
    const contentType = (headers['Content-Type'] || headers['content-type'] || '');
    if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData) && !/application\/x-www-form-urlencoded/i.test(String(contentType))) {
      // Convert only JSON-like bodies (skip FormData and urlencoded)
      (config as AxiosRequestConfig).data = deepSnake(config.data as unknown);
    }
  } catch {
    // ignore transform errors
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

api.interceptors.response.use((res) => {
  try {
    if (res?.data && typeof res.data === 'object' && !(res.data instanceof ArrayBuffer) && !(res.data instanceof FormData)) {
      res.data = deepCamelize(res.data);
    }
  } catch {
    // ignore transform errors
  }
  return res;
}, responseErrorInterceptor(api));

authInstance.interceptors.response.use((res) => {
  try {
    if (res?.data && typeof res.data === 'object' && !(res.data instanceof ArrayBuffer) && !(res.data instanceof FormData)) {
      res.data = deepCamelize(res.data);
    }
  } catch {
    // ignore transform errors
  }
  return res;
}, responseErrorInterceptor(authInstance));

/**
 * 从后端响应数据中安全提取 message 字段
 * @param data 后端返回的响应数据（可能为任意类型）
 * @returns message 字符串或 undefined
 */
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
/**
 * 记录 API 错误（用于开发或上报）
 * @param tag 错误来源标识
 * @param err 捕获到的错误对象
 */
export function logApiError(tag: string, err: unknown) {
  const e = err as AxiosError | undefined;
  // 忽略被取消的请求（开发模式下 React 严格模式会导致请求被取消）
  if (isCanceledError(err)) {
    return;
  }
  logger.error(`${tag} error:`, e?.response?.status, e?.response?.data, e?.message);
}

// 导出一个辅助函数，便于组件创建取消控制器并在卸载时中止请求
/**
 * 创建一个 AbortController，用于取消请求
 * @returns AbortController 实例
 */
export function makeAbortController(): AbortController {
  return new AbortController();
}

// 判断是否为请求被取消（Abort/axios cancel）
/**
 * 判断一个错误对象是否为请求被取消的错误
 * @param e 任意错误对象
 * @returns 如果是取消错误返回 true，否则 false
 */
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

/**
 * 认证相关 API：login / logout / validate
 * 方法返回统一格式：{ success: boolean; data?: T; message?: string }
 */
export const authApi = {
  login: async (payload: LoginRequest): Promise<{ success: boolean; data?: LoginVO; message?: string }> => {
    const url = '/auth/login';
    // 从 cookie 中读取防 CSRF token（如果有）并放入 header / form
    const getCsrfFromCookie = () => {
      try {
        if (typeof document === 'undefined' || !document.cookie) return null;
        const m = document.cookie.match(/(?:^|; )__RequestVerificationToken=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : null;
      } catch {
        return null;
      }
    };
    const csrfToken = getCsrfFromCookie();

    const csfHeaders = csrfToken ? {
      RequestVerificationToken: csrfToken,
      'X-CSRF-TOKEN': csrfToken,
      'X-XSRF-TOKEN': csrfToken,
      'X-CSRFToken': csrfToken
    } : {};

    const jsonPayload = csrfToken ? { ...payload, __RequestVerificationToken: csrfToken } : payload;
    const jsonCfg = { headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...csfHeaders }, responseType: 'text' as const };
    try {
      console.debug('[authApi.login] request', { baseURL: authInstance.defaults.baseURL, url, payload: jsonPayload, jsonCfg });
      const res = await authInstance.post(url, jsonPayload, jsonCfg);
      console.debug('[authApi.login] raw response text', { status: res?.status, text: res?.data });
      // 尝试把响应解析为 JSON（某些后端会返回 JSON 字符串）
      let parsed: unknown = undefined;
      try {
        parsed = JSON.parse(res?.data as string);
      } catch (parseErr) {
        console.warn('[authApi.login] response not JSON', parseErr);
      }
      const norm = normalizeResponse<LoginVO>(parsed ?? res?.data);

      // 兼容后端可能的嵌套：data.data.token
      const raw = (norm.data ?? (parsed ?? res?.data)) as Record<string, unknown> | undefined;
      const inner = (raw && typeof raw === 'object' ? (raw.data ?? raw) : raw) as Record<string, unknown> | undefined;
      const token = (inner && ((inner as Record<string, unknown>).token ?? ((inner as Record<string, Record<string, unknown>>).data && (inner as Record<string, Record<string, unknown>>).data.token))) ?? undefined;

      const loginVo: LoginVO = {
        token: (token as string) ?? ((inner as Record<string, unknown>)?.token as string) ?? '',
        role: ((inner as Record<string, unknown>)?.role as string) ?? undefined,
        realName: ((inner as Record<string, unknown>)?.realName as string) ?? undefined,
        userId: ((inner as Record<string, unknown>)?.userId as number) ?? undefined,
        relatedId: ((inner as Record<string, unknown>)?.relatedId as number) ?? undefined
      };

      if (loginVo.token) {
        try { setToken(loginVo.token); } catch (e) { console.warn('Failed to set token:', e); }
        try { useStore.getState().setToken(loginVo.token); } catch (e) { console.warn('Failed to set store token:', e); }
      }

      return { success: norm.success, data: loginVo, message: norm.message };
    } catch (err: unknown) {
      const e = err as AxiosError;
      console.error('[authApi.login] error', e, e?.config, e?.response?.status, e?.response?.data);

      // 如果后端返回403，尝试使用form-urlencoded作为兼容（同样以text方式接收原始响应）
      if (e.response?.status === 403) {
        try {
          const formData = new URLSearchParams();
          formData.append('username', payload.username);
          formData.append('password', payload.password);
          if (csrfToken) formData.append('__RequestVerificationToken', csrfToken);
          const formCfg = { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...(csrfToken ? { 'RequestVerificationToken': csrfToken } : {}) }, responseType: 'text' as const };
          console.debug('[authApi.login] retry with form', { baseURL: authInstance.defaults.baseURL, url, formData, formCfg });
          const res2 = await authInstance.post(url, formData, formCfg);
          console.debug('[authApi.login] retry raw response text', { status: res2?.status, text: res2?.data });
          let parsed2: unknown = undefined;
          try { parsed2 = JSON.parse(res2?.data as string); } catch (parseErr) { console.warn('[authApi.login] form response not JSON', parseErr); }
          const norm = normalizeResponse<LoginVO>(parsed2 ?? res2?.data);

          // 兼容嵌套 data.data.token
          const raw = (norm.data ?? (parsed2 ?? res2?.data)) as Record<string, unknown> | undefined;
          const inner = (raw && typeof raw === 'object' ? (raw.data ?? raw) : raw) as Record<string, unknown> | undefined;
          const token = (inner && ((inner as Record<string, unknown>).token ?? ((inner as Record<string, Record<string, unknown>>).data && (inner as Record<string, Record<string, unknown>>).data.token))) ?? undefined;

          const loginVo: LoginVO = {
            token: (token as string) ?? ((inner as Record<string, unknown>)?.token as string) ?? '',
            role: ((inner as Record<string, unknown>)?.role as string) ?? undefined,
            realName: ((inner as Record<string, unknown>)?.realName as string) ?? undefined,
            userId: ((inner as Record<string, unknown>)?.userId as number) ?? undefined,
            relatedId: ((inner as Record<string, unknown>)?.relatedId as number) ?? undefined
          };

          if (loginVo.token) {
            try { setToken(loginVo.token); } catch (e) { console.warn('Failed to set token:', e); }
            try { useStore.getState().setToken(loginVo.token); } catch (e) { console.warn('Failed to set store token:', e); }
          }

          return { success: norm.success, data: loginVo, message: norm.message };
        } catch (formErr: unknown) {
          console.error('[authApi.login] form fallback error', formErr);
          logApiError('authApi.login.fallback', formErr);
        }
      }

      // 如果不是403或回退仍失败，记录并返回友好信息
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


/**
 * 挂号相关 API（护士工作台）
 */
export const registrationApi = {
  // 1. 提交挂号接口
  create: async (data: RegistrationDTO): Promise<{ success: boolean; data?: RegistrationVO; message?: string }> => {
    try {
      // 发送前规范化字段：兼容 regFee 和 registrationFee 两种命名
      const payload = { ...data, regFee: data.regFee ?? data.registrationFee, gender: (data.gender as unknown) as import('../types').Gender } as RegistrationDTO & { regFee?: number };
      // 新后端路径优先：/nurse/registrations
      try {
        const res = await api.post('/nurse/registrations', payload);
        const norm = normalizeResponse<RegistrationVO>(res?.data);
        return { success: norm.success, data: norm.data, message: norm.message };
      } catch (e) {
        logger.debug('registrationApi.create: new endpoint failed, fallback to /registrations', e);
      }
      const res = await api.post('/registrations', payload);
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
      // POST '/nurse/registrations/today'，body 支持筛选条件
      const res = await api.post('/nurse/registrations/today', params ?? {}, { ...(config ?? {}) });
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
        const res = await api.get(`/nurse/registrations/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
        const norm = normalizeResponse<RegistrationVO>(res?.data);
        if (norm.data) return norm.data;
      } catch (e) {
        logger.debug('registrationApi.getById: new endpoint failed, fallback to /registrations/{id}', e);
      }
      const res2 = await api.get(`/registrations/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
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
/**
 * 患者相关 API：查找、检索与创建
 */
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
      // 使用新的公共接口：/common/data/doctors
      const url = deptId ? `/common/data/doctors?deptId=${encodeURIComponent(String(deptId))}` : '/common/data/doctors';
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
      // 使用新的公共接口：/common/data/departments
      const res = await api.get('/common/data/departments');
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
/**
 * 药房相关 API：库存、待发药、发药操作等
 */
export const pharmacyApi = {
  // 查询库存（支持关键字/低库存筛选）
  getDrugs: async (keyword?: string, lowStock?: boolean, config?: AxiosRequestConfig): Promise<Drug[]> => {
    try {
      const params: Record<string, unknown> = {};
      if (keyword) params.keyword = keyword;
      if (lowStock) params.stockStatus = 'LOW';
      const res = await api.get('/common/medicines', { ...(config ?? {}), params });
      const norm = normalizeResponse<{ content?: Drug[] } | Drug[]>(res?.data);
      const data = norm.data as unknown;
      const normalizeDrug = (d: unknown): Drug => {
        const src = (d as Record<string, unknown>) ?? {};
        const out: Record<string, unknown> = { ...src };
        const priceVal = (src['price'] ?? src['retailPrice'] ?? src['retail_price']) as string | number | undefined;
        out['price'] = priceVal !== undefined ? String(priceVal) : '0';
        out['retailPrice'] = src['retailPrice'] ?? src['retail_price'] ?? out['price'];
        const stockVal = (src['stock'] ?? src['stockQuantity'] ?? src['stock_quantity']) as number | undefined;
        out['stock'] = typeof stockVal === 'number' ? stockVal : Number(stockVal ?? 0);
        out['stockQuantity'] = src['stockQuantity'] ?? src['stock_quantity'] ?? out['stock'];

        return {
          id: Number(src['mainId'] ?? src['id'] ?? src['main_id'] ?? 0),
          medicineCode: String(src['medicineCode'] ?? src['medicine_code'] ?? ''),
          name: String(src['name'] ?? ''),
          commonName: (src['genericName'] ?? src['commonName'] ?? null) as string | null,
          spec: (src['specification'] ?? src['spec'] ?? null) as string | null,
          unit: (src['unit'] ?? null) as string | null,
          price: String(out['price']),
          purchasePrice: (src['purchasePrice'] ?? src['purchase_price'] ?? null) as string | null,
          profitMargin: (src['profitMargin'] ?? src['profit_margin']) as number | null,
          stock: Number(out['stock'] as number),
          minStock: (src['minStock'] ?? src['min_stock'] ?? null) as number | null,
          maxStock: (src['maxStock'] ?? src['max_stock'] ?? null) as number | null,
          manufacturer: (src['manufacturer'] ?? null) as string | null,
          category: (src['category'] ?? null) as string | null,
          expiryWarningDays: (src['expiryWarningDays'] ?? src['expiry_warning_days'] ?? null) as number | null,
          isPrescription: Number(src['isPrescription'] ?? src['is_prescription'] ?? 0),
          status: Number(src['status'] ?? 0),
          is_deleted: (src['is_deleted'] ?? null) as number | null,
          approvalNo: (src['approvalNo'] ?? src['approval_no'] ?? null) as string | null,
          storageCondition: (src['storageCondition'] ?? src['storage_condition'] ?? null) as string | null,
          version: (src['version'] ?? null) as number | null,
          batchNumber: (src['batchNumber'] ?? src['batch_number'] ?? null) as string | null,
          productionDate: (src['productionDate'] ?? src['production_date'] ?? null) as string | null,
          expiryDate: (src['expiryDate'] ?? src['expiry_date'] ?? null) as string | null,
        } as Drug;
      };
      if (data && typeof data === 'object' && 'content' in (data as Record<string, unknown>)) {
        const content = (data as Record<string, unknown>)['content'];
        if (Array.isArray(content)) return content.map(normalizeDrug) as Drug[];
      }
      if (Array.isArray(res?.data)) return (res?.data as unknown as Record<string, unknown>[]).map(normalizeDrug) as Drug[];
      if (Array.isArray(data)) return (data as Record<string, unknown>[]).map(normalizeDrug) as Drug[];
      return [] as Drug[];
    } catch (err) {
      logApiError('pharmacyApi.getDrugs', err as AxiosError);
      return [];
    }
  },

  // 获取待发药处方列表（已审核但未发药）
  getPendingPrescriptions: async (config?: AxiosRequestConfig): Promise<PrescriptionVO[]> => {
    try {
      const res = await api.get('/pharmacist/prescriptions/pending', { ...(config ?? {}) });
      const norm = normalizeResponse<PrescriptionVO[]>(res?.data);
      if (norm.data) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as PrescriptionVO[]) : [];
    } catch (err) {
      logApiError('pharmacyApi.getPendingPrescriptions', err as AxiosError);
      return [];
    }
  },

  // 根据处方ID发药（自动扣减库存）
  dispense: async (prescriptionId: number): Promise<boolean> => {
    try {
      const res = await api.post(`/pharmacist/prescriptions/${encodeURIComponent(String(prescriptionId))}/dispense`);
      const norm = normalizeResponse<unknown>(res?.data);
      const rawData = res?.data as { code?: number } | undefined;
      return norm.success || (rawData?.code === 200);
    } catch (err) {
      logApiError('pharmacyApi.dispense', err);
      return false;
    }
  },

  // 退药操作（根据处方ID，自动归还库存）
  returnMedicine: async (prescriptionId: number, reason: string): Promise<boolean> => {
    try {
      const res = await api.post(`/pharmacist/prescriptions/${encodeURIComponent(String(prescriptionId))}/return`, null, {
        params: { reason }
      });
      const norm = normalizeResponse<unknown>(res?.data);
      const rawData = res?.data as { code?: number } | undefined;
      return norm.success || (rawData?.code === 200);
    } catch (err) {
      logApiError('pharmacyApi.returnMedicine', err);
      return false;
    }
  },

  // 审核处方
  reviewPrescription: async (prescriptionId: number, reviewDoctorId: number, remark?: string): Promise<boolean> => {
    try {
      const params: Record<string, unknown> = { reviewDoctorId };
      if (remark) params.remark = remark;
      const res = await api.post(`/pharmacist/prescriptions/${encodeURIComponent(String(prescriptionId))}/review`, null, { params });
      const norm = normalizeResponse<unknown>(res?.data);
      const rawData = res?.data as { code?: number } | undefined;
      return norm.success || (rawData?.code === 200);
    } catch (err) {
      logApiError('pharmacyApi.reviewPrescription', err);
      return false;
    }
  },

  // 今日发药统计
  getTodayStatistics: async (): Promise<PharmacistStatisticsDTO | null> => {
    try {
      const res = await api.get('/pharmacist/prescriptions/statistics/today');
      const norm = normalizeResponse<PharmacistStatisticsDTO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('pharmacyApi.getTodayStatistics', err);
      return null;
    }
  },

  // 获取库存统计数据（用于仪表盘）
  getInventoryStats: async (): Promise<InventoryStatsVO | null> => {
    try {
      const res = await api.get('/pharmacist/medicines/inventory-stats');
      const norm = normalizeResponse<InventoryStatsVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('pharmacyApi.getInventoryStats', err);
      return null;
    }
  },

  // 更新药品库存（手动调整：入库/出库）
  updateStock: async (medicineId: number, quantity: number, reason: string): Promise<boolean> => {
    try {
      const res = await api.put(`/pharmacist/medicines/${encodeURIComponent(String(medicineId))}/stock`, null, {
        params: { quantity, reason }
      });
      const norm = normalizeResponse<unknown>(res?.data);
      const rawData = res?.data as { code?: number } | undefined;
      return norm.success || (rawData?.code === 200);
    } catch (err) {
      logApiError('pharmacyApi.updateStock', err);
      return false;
    }
  },

  // 根据药品ID查询详情（公共接口）
  getById: async (id: number, config?: AxiosRequestConfig): Promise<Drug | null> => {
    try {
      const res = await api.get(`/common/medicines/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
      const norm = normalizeResponse<Drug>(res?.data);
      const src = (norm.data ?? res?.data) as Record<string, unknown> | undefined;
      if (src && typeof src === 'object') {
        const o = (src['data'] ?? src) as Record<string, unknown>;
        const priceVal = (o['price'] ?? o['retailPrice'] ?? o['retail_price']) as string | number | undefined;
        const stockVal = (o['stock'] ?? o['stockQuantity'] ?? o['stock_quantity']) as number | undefined;

        const specVal = (o['specification'] ?? o['spec'] ?? null) as string | null;
        const unitVal = (o['unit'] ?? null) as string | null;
        const priceStr = String(priceVal ?? '0');
        const stockNumber = typeof stockVal === 'number' ? stockVal : Number(stockVal ?? 0);
        const drug: Drug = {
          id: Number(o['mainId'] ?? o['id'] ?? o['main_id'] ?? 0),
          medicineCode: String(o['medicineCode'] ?? o['medicine_code'] ?? ''),
          name: String(o['name'] ?? ''),
          commonName: (o['genericName'] ?? o['commonName'] ?? null) as string | null,
          spec: specVal,
          unit: unitVal,
          price: priceStr,
          purchasePrice: (o['purchasePrice'] ?? o['purchase_price'] ?? null) as string | null,
          profitMargin: (o['profitMargin'] ?? o['profit_margin'] ?? null) as number | null,
          stock: stockNumber,
          minStock: (o['minStock'] ?? o['min_stock'] ?? null) as number | null,
          maxStock: (o['maxStock'] ?? o['max_stock'] ?? null) as number | null,
          manufacturer: (o['manufacturer'] ?? null) as string | null,
          category: (o['category'] ?? null) as string | null,
          expiryWarningDays: null,
          isPrescription: (typeof o['isPrescription'] !== 'undefined' ? Number(o['isPrescription']) : (typeof o['is_prescription'] !== 'undefined' ? Number(o['is_prescription']) : 0)),
          status: Number(o['status'] ?? 0),
          is_deleted: null,
          approvalNo: (o['approvalNo'] ?? o['approval_no'] ?? null) as string | null,
          storageCondition: (o['storageCondition'] ?? o['storage_condition'] ?? null) as string | null,
          version: (o['version'] ?? null) as number | null,
          batchNumber: (o['batchNumber'] ?? o['batch_number'] ?? null) as string | null,
          productionDate: (o['productionDate'] ?? o['production_date'] ?? null) as string | null,
          expiryDate: (o['expiryDate'] ?? o['expiry_date'] ?? null) as string | null,
        };
        return drug;
      }
      return null;
    } catch (err) {
      logApiError('pharmacyApi.getById', err as AxiosError);
      return null;
    }
  },

  // 医生/系统推送处方到药房
  sendPrescription: async (rx: PrescriptionVO): Promise<PrescriptionVO | null> => {
    try {
      const res = await api.post('/prescriptions', rx);
      const norm = normalizeResponse<PrescriptionVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('pharmacyApi.sendPrescription', err);
      return null;
    }
  },

  // 查询药品详情（根据药品ID）
  getMedicineDetail: async (id: number, config?: AxiosRequestConfig): Promise<MedicineVO | null> => {
    try {
      const res = await api.get(`/common/medicines/${encodeURIComponent(String(id))}`, { ...(config ?? {}) });
      const norm = normalizeResponse<MedicineVO>(res?.data);
      const src = (norm.data ?? res?.data) as Record<string, unknown> | undefined;
      if (src && typeof src === 'object') {
        const o = (src['data'] ?? src) as Record<string, unknown>;
        const priceVal = (o['price'] ?? o['retailPrice'] ?? o['retail_price']) as string | number | undefined;
        const stockVal = (o['stock'] ?? o['stockQuantity'] ?? o['stock_quantity']) as number | undefined;
        const out: MedicineVO = {
          mainId: Number(o['mainId'] ?? o['id'] ?? o['main_id'] ?? 0),
          medicineCode: String(o['medicineCode'] ?? o['medicine_code'] ?? ''),
          name: String(o['name'] ?? ''),
          genericName: (o['genericName'] ?? o['generic_name'] ?? null) as string | null,
          retailPrice: String(priceVal ?? '0'),
          purchasePrice: (o['purchasePrice'] ?? o['purchase_price'] ?? null) as string | null,
          profitMargin: typeof o['profitMargin'] === 'number' ? (o['profitMargin'] as number) : (typeof o['profit_margin'] === 'number' ? (o['profit_margin'] as number) : null),
          stockQuantity: typeof stockVal === 'number' ? stockVal : Number(stockVal ?? 0),
          minStock: typeof o['minStock'] === 'number' ? (o['minStock'] as number) : (typeof o['min_stock'] === 'number' ? (o['min_stock'] as number) : null),
          maxStock: typeof o['maxStock'] === 'number' ? (o['maxStock'] as number) : (typeof o['max_stock'] === 'number' ? (o['max_stock'] as number) : null),
          status: Number(o['status'] ?? 0),
          specification: (o['specification'] ?? o['spec'] ?? null) as string | null,
          unit: (o['unit'] ?? null) as string | null,
          dosageForm: (o['dosageForm'] ?? o['dosage_form'] ?? null) as string | null,
          manufacturer: (o['manufacturer'] ?? null) as string | null,
          category: (o['category'] ?? null) as string | null,
          isPrescription: Number(o['isPrescription'] ?? o['is_prescription'] ?? 0),
          approvalNo: (o['approvalNo'] ?? o['approval_no'] ?? null) as string | null,
          storageCondition: (o['storageCondition'] ?? o['storage_condition'] ?? null) as string | null,
          version: (o['version'] ?? null) as number | null,
          batchNumber: (o['batchNumber'] ?? o['batch_number'] ?? null) as string | null,
          productionDate: (o['productionDate'] ?? o['production_date'] ?? null) as string | null,
          expiryDate: (o['expiryDate'] ?? o['expiry_date'] ?? null) as string | null,
        };
        return out;
      }
      return null;
    } catch (err) {
      logApiError('pharmacyApi.getMedicineDetail', err as AxiosError);
      return null;
    }
  },

  // 搜索药品（根据关键字模糊搜索）
  searchMedicines: async (keyword?: string, config?: AxiosRequestConfig): Promise<MedicineVO[]> => {
    try {
      const params: Record<string, unknown> = keyword ? { keyword } : {};
      const res = await api.get('/common/medicines', { ...(config ?? {}), params });
      const norm = normalizeResponse<{ content?: MedicineVO[] } | MedicineVO[]>(res?.data);
      const data = norm.data as unknown;
      if (data && typeof data === 'object' && 'content' in (data as Record<string, unknown>)) {
        const content = (data as Record<string, unknown>)['content'];
        if (Array.isArray(content)) return content as MedicineVO[];
      }
      if (Array.isArray(res?.data)) return res?.data as MedicineVO[];
      if (Array.isArray(data)) return data as MedicineVO[];
      return [] as MedicineVO[];
    } catch (err) {
      logApiError('pharmacyApi.searchMedicines', err as AxiosError);
      return [];
    }
  }
};

// --- 病历 API ---
/**
 * 病历相关 API：查询与保存病历
 */
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
/**
 * 医生相关 API：候诊、病历与医嘱操作
 */
export const doctorApi = {
  // 获取医生候诊列表，showAll=true 返回科室全部候诊
  getWaitingList: async (showAll = false, config?: AxiosRequestConfig): Promise<RegistrationVO[]> => {
    try {
      // 合并 config.params（例如 doctorId/deptId）和 showAll 标志
      const params = { ...(config?.params ?? {}), showAll } as Record<string, unknown>;
      logger.debug('doctorApi.getWaitingList request', { params });
      const res = await api.get(`/doctor/waiting-list`, { ...(config ?? {}), params });
      logger.debug('doctorApi.getWaitingList raw response', { status: res?.status, data: res?.data });
      const norm = normalizeResponse<RegistrationVO[]>(res?.data);
      logger.debug('doctorApi.getWaitingList normalized', { success: norm.success, message: norm.message, data: norm.data });
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
        gender: item.gender ?? 0,
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
      const res = await api.put(`/doctor/registrations/${encodeURIComponent(String(id))}/status`, null, { params: { status } });
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
      const res = await api.get(`/doctor/medical-records/${encodeURIComponent(String(id))}`);
      const norm = normalizeResponse<MedicalRecordVO>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getMedicalRecordDetail', e);
      return null;
    }
  },

  // 查询患者历史病历列表
  getPatientHistory: async (patientId: number): Promise<MedicalRecordVO[]> => {
    try {
      const res = await api.get(`/doctor/medical-records`, { params: { patientId } });
      const norm = normalizeResponse<MedicalRecordVO[]>(res?.data);
      if (norm.data) return norm.data;
      return [];
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getPatientHistory', e);
      return [];
    }
  },

  // 查询患者详细信息
  getPatientDetail: async (id: number, adminPatientId?: number): Promise<PatientDetailVO | null> => {
    try {
      const params = adminPatientId ? { adminPatientId } : {};
      const res = await api.get(`/doctor/patients/${encodeURIComponent(String(id))}`, { params });
      const norm = normalizeResponse<PatientDetailVO>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getPatientDetail', e);
      return null;
    }
  },

  // 提交病历
  submitMedicalRecord: async (id: number): Promise<boolean> => {
    try {
      const res = await api.post(`/doctor/medical-records/${encodeURIComponent(String(id))}/submit`);
      const norm = normalizeResponse<unknown>(res?.data);
      return norm.success;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.submitMedicalRecord', e);
      return false;
    }
  },

  // 根据挂号单查询病历
  getMedicalRecordByRegistrationId: async (registrationId: number): Promise<MedicalRecordVO | null> => {
    try {
      const res = await api.get(`/doctor/medical-records/by-registration/${encodeURIComponent(String(registrationId))}`);
      const norm = normalizeResponse<MedicalRecordVO>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.getMedicalRecordByRegistrationId', e);
      return null;
    }
  },

  // 保存或更新病历
  saveMedicalRecord: async (data: MedicalRecordDTO): Promise<MedicalRecordVO | null> => {
    try {
      const res = await api.post('/doctor/medical-records/save', data);
      const norm = normalizeResponse<MedicalRecordVO>(res?.data);
      return norm.data ?? null;
    } catch (err: unknown) {
      const e = err as AxiosError;
      logApiError('doctorApi.saveMedicalRecord', e);
      return null;
    }
  }
};

// 收费管理接口
/**
 * 收费管理 API：创建收费单、支付、退费与报表
 */
export const chargeApi = {
  // 获取收费列表
  getList: async (params?: { chargeNo?: string; patientId?: number; status?: number; startDate?: string; endDate?: string; page?: number; size?: number }, config?: AxiosRequestConfig): Promise<PageChargeVO | null> => {
    try {
      const res = await api.get('/cashier/charges', { params, ...config });
      const norm = normalizeResponse<PageChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.getList', err as AxiosError);
      return null;
    }
  },

  // 创建收费单
  create: async (data: CreateChargeDTO, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.post('/cashier/charges', data, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.create', err as AxiosError);
      return null;
    }
  },

  // 获取收费单详情
  getDetail: async (id: number, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.get(`/cashier/charges/${encodeURIComponent(String(id))}`, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.getDetail', err as AxiosError);
      return null;
    }
  },

  // 支付
  pay: async (id: number, data: PaymentDTO, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.post(`/cashier/charges/${encodeURIComponent(String(id))}/pay`, data, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.pay', err as AxiosError);
      return null;
    }
  },

  // 退费
  refund: async (id: number, data: RefundRequest, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.post(`/cashier/charges/${encodeURIComponent(String(id))}/refund`, data, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.refund', err as AxiosError);
      return null;
    }
  },

  // 日报表
  getDailyReport: async (params?: { date?: string }, config?: AxiosRequestConfig): Promise<DailySettlementVO | null> => {
    try {
      const res = await api.get('/cashier/charges/statistics/daily', { params, ...config });
      const norm = normalizeResponse<DailySettlementVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.getDailyReport', err as AxiosError);
      return null;
    }
  },

  // 为挂号单创建仅包含挂号费的收费单
  createRegistrationCharge: async (registrationId: number, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.post(`/cashier/charges/registration/${encodeURIComponent(String(registrationId))}`, {}, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.createRegistrationCharge', err as AxiosError);
      return null;
    }
  },

  // 为挂号单创建仅包含处方费的收费单
  createPrescriptionCharge: async (data: CreateChargeDTO, config?: AxiosRequestConfig): Promise<ChargeVO | null> => {
    try {
      const res = await api.post('/cashier/charges/prescription', data, config);
      const norm = normalizeResponse<ChargeVO>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.createPrescriptionCharge', err as AxiosError);
      return null;
    }
  },

  // 获取挂号单的所有收费记录（按类型分组）
  getChargesByRegistration: async (registrationId: number, config?: AxiosRequestConfig): Promise<{ registration?: ChargeVO[]; prescription?: ChargeVO[]; combined?: ChargeVO[] } | null> => {
    try {
      const res = await api.get(`/cashier/charges/registration/${encodeURIComponent(String(registrationId))}/by-type`, config);
      const norm = normalizeResponse<{ registration?: ChargeVO[]; prescription?: ChargeVO[]; combined?: ChargeVO[] }>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('chargeApi.getChargesByRegistration', err as AxiosError);
      return null;
    }
  },

  // 检查挂号费是否已支付
  checkRegistrationPaymentStatus: async (registrationId: number, config?: AxiosRequestConfig): Promise<boolean> => {
    try {
      const res = await api.get(`/cashier/charges/registration/${encodeURIComponent(String(registrationId))}/payment-status`, config);
      const norm = normalizeResponse<boolean>(res?.data);
      return Boolean(norm.data);
    } catch (err) {
      logApiError('chargeApi.checkRegistrationPaymentStatus', err as AxiosError);
      return false;
    }
  },
};

// --- 审计日志 API ---
/**
 * 审计日志相关 API：查询操作日志和安全审计
 */
export const auditApi = {
  // 查询操作人的审计日志
  getByOperatorId: async (operatorId: number): Promise<AuditLogEntity[]> => {
    try {
      const res = await api.get(`/audit-logs/operator/${encodeURIComponent(String(operatorId))}`);
      const norm = normalizeResponse<AuditLogEntity[]>(res?.data);
      if (norm.data && Array.isArray(norm.data)) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as AuditLogEntity[]) : [];
    } catch (err) {
      logApiError('auditApi.getByOperatorId', err as AxiosError);
      return [];
    }
  },

  // 综合查询审计日志（支持分页和多条件查询）
  search: async (params: {
    page?: number;
    size?: number;
    sort?: string[];
    module?: string;
    action?: string;
    operatorUsername?: string;
    auditType?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<PageAuditLogEntity | null> => {
    try {
      const res = await api.get('/audit-logs/search', { params });
      const norm = normalizeResponse<PageAuditLogEntity>(res?.data);
      return norm.data ?? null;
    } catch (err) {
      logApiError('auditApi.search', err as AxiosError);
      return null;
    }
  },

  // 根据TraceId查询审计日志
  getByTraceId: async (traceId: string): Promise<AuditLogEntity[]> => {
    try {
      const res = await api.get(`/audit-logs/trace/${encodeURIComponent(traceId)}`);
      const norm = normalizeResponse<AuditLogEntity[]>(res?.data);
      if (norm.data && Array.isArray(norm.data)) return norm.data;
      return Array.isArray(res?.data) ? (res?.data as AuditLogEntity[]) : [];
    } catch (err) {
      logApiError('auditApi.getByTraceId', err as AxiosError);
      return [];
    }
  },
};
