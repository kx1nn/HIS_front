// src/pages/Login/index.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Activity, ChevronRight } from 'lucide-react';
import { useStore, type AppState } from '../../store/store';
import type { User as UserType } from '../../types';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const login = useStore((state: AppState) => state.login);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 模拟后端验证
    setTimeout(() => {
      setLoading(false);
      let role = '';
      let name = '';
      let dept = '';

      // 简单模拟账号逻辑
      if (username === 'nurse') {
        role = 'nurse'; name = '李护士'; dept = '门诊部';
      } else if (username === 'doctor') {
        role = 'doctor'; name = '王医生'; dept = '内科';
      } else if (username === 'admin') {
        role = 'admin'; name = '管理员'; dept = '信息科';
      } else {
        setError('账号错误，测试请用: nurse 或 doctor');
        return;
      }

      // 1. 存入全局状态
      login({ role: role as UserType['role'], name, dept });

      // 2. 跳转到对应界面
      if (role === 'nurse') navigate('/nurse');
      else if (role === 'doctor') navigate('/doctor');
      else navigate('/admin');
    }, 800);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
            <Activity className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">HIS 系统登录</h1>
          <p className="text-slate-400 text-sm mt-2">医疗业务综合管理平台</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">账号</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="请输入 nurse 或 doctor"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="任意密码"
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
        
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400">测试账号: nurse (护士站) / doctor (医生站)</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;