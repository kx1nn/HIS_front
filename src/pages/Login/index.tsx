// src/pages/Login/index.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, Activity, ChevronRight } from 'lucide-react';
import { useStore, type AppState } from '../../store/store';
import { authApi } from '../../services/api';
import type { User as UserType } from '../../types';

/**
 * 登录页面组件
 * 负责：用户认证、错误提示与跳转到对应工作台
 */
const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = (location.state as { authExpired?: boolean; message?: string } | null) ?? null;
  const notify = useStore((s: AppState) => s.notify);
  const login = useStore((state: AppState) => state.login);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // 将后端可能带有英文字段名前缀的错误消息做本地化清理（函数声明可被提升）
  function sanitizeErrorMessage(m: string | undefined | null) {
    if (!m) return '';
    try {
      const withoutKeys = (m as string).replace(/\b(username|password|user|pass|email)\s*:\s*/ig, '');
      return withoutKeys.replace(/;\s*/g, '； ').replace(/,\s*/g, '， ').trim();
    } catch {
      return m as string;
    }
  }

  const [error, setError] = useState(sanitizeErrorMessage(locState?.message ?? ''));

  useEffect(() => {
    if (locState?.message) notify(sanitizeErrorMessage(locState.message), 'error');
  }, [locState?.message, notify]);

  

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    (async () => {
      try {
        const res = await authApi.login({ username, password });
        setLoading(false);
        if (res.success && res.data && res.data.token) {
          const data = res.data;
          // 存 token
          useStore.getState().setToken(data.token);
          // map backend role -> normalized frontend role
          const roleStr = (data.role || 'admin').toString().toLowerCase();
          const name = data.realName || username;
          let normalizedRole: UserType['role'] = 'admin';
          if (roleStr.includes('nurse')) normalizedRole = 'nurse';
          else if (roleStr.includes('doctor')) normalizedRole = 'doctor';
          else if (roleStr.includes('pharm')) normalizedRole = 'pharmacy';

          // 存入全局状态
          login({ 
            role: normalizedRole, 
            name, 
            dept: '',
            userId: data.userId,
            relatedId: data.relatedId
          });
          // 跳转到对应工作台
          if (normalizedRole === 'nurse') navigate('/nurse');
          else if (normalizedRole === 'doctor') navigate('/doctor');
          else if (normalizedRole === 'pharmacy') navigate('/pharmacy');
          else navigate('/admin');
          return;
        }
        // 后端返回失败且包含 message，直接展示
        if (res && !res.success && res.message) {
          setError(sanitizeErrorMessage(res.message));
          return;
        }
        // 若接口返回失败且无 message，则展示错误
        // catch: 网络或认证失败，直接返回错误提示s
      } catch (err) {
        setLoading(false);
        console.error('[Login] login error:', err);
        setError('网络或认证失败，请检查用户名和密码');
        return;
      }
    })();
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
            <Activity className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">HIS 系统登录</h1>
          <p className="text-slate-400 text-sm mt-2">医院信息管理平台</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <div className="relative">
              <User className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="输入用户名"
                aria-label="用户名"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="输入密码"
                aria-label="密码"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-500 text-sm rounded-lg flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className={`w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex justify-center items-center gap-2 transition-all ${loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'}`}
          >
            {loading ? '登录中...' : <>登录系统 <ChevronRight size={18} /></>}
          </button>
        </form>
        
        {/* 测试账号说明已移除；请使用真实后端账号登录 */}
      </div>
    </div>
  );
};

export default LoginPage;