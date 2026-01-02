import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/store';
import { authApi } from '../services/api';

// 验证缓存：避免短时间内重复验证
const VALIDATION_CACHE_MS = 30000; // 30秒内不重复验证
let lastValidationTime = 0;
let lastValidationResult = false;

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  const user = useStore(s => s.user);
  const notify = useStore(s => s.notify);
  
  // 若没有 token 直接视为未登录
  const [valid, setValid] = useState<boolean | null>(token ? null : false);
  const validatingRef = useRef(false); // 防止并发验证

  useEffect(() => {
    let mounted = true;
    if (!token) {
      // 无 token，初始已为未登录，无需再次 setState
      lastValidationTime = 0;
      lastValidationResult = false;
      return () => { mounted = false; };
    }

    // 检查缓存：如果在缓存时间内且上次验证成功，直接使用缓存结果
    const now = Date.now();
    if (lastValidationResult && now - lastValidationTime < VALIDATION_CACHE_MS) {
      // 直接进行角色检查
      const path = location.pathname || '';
      const role = user?.role?.toString().toLowerCase();
      const mapping: Array<{ prefix: string; role: string }> = [
        { prefix: '/nurse', role: 'nurse' },
        { prefix: '/doctor', role: 'doctor' },
        { prefix: '/pharmacy', role: 'pharmacy' },
        { prefix: '/admin', role: 'admin' }
      ];
      const matched = mapping.find(m => path.startsWith(m.prefix));
      if (matched && (!role || role !== matched.role.toLowerCase())) {
        notify('无权访问该工作台，请使用对应角色账号登录', 'error');
        logout();
        setValid(false);
        return () => { mounted = false; };
      }
      setValid(true);
      return () => { mounted = false; };
    }

    // 防止并发验证
    if (validatingRef.current) {
      return () => { mounted = false; };
    }

    validatingRef.current = true;

    (async () => {
      try {
        const ok = await authApi.validate();
        if (!mounted) return;
        
        lastValidationTime = Date.now();
        lastValidationResult = ok;

        if (!ok) {
          logout();
          setValid(false);
          return;
        }

        // 验证通过后进行基于路由的角色检查（对比时忽略大小写）
        const path = location.pathname || '';
        const role = user?.role?.toString().toLowerCase();
        const mapping: Array<{ prefix: string; role: string }> = [
          { prefix: '/nurse', role: 'nurse' },
          { prefix: '/doctor', role: 'doctor' },
          { prefix: '/pharmacy', role: 'pharmacy' },
          { prefix: '/admin', role: 'admin' }
        ];
        const matched = mapping.find(m => path.startsWith(m.prefix));
        if (matched && (!role || role !== matched.role.toLowerCase())) {
          // 非法访问，登出并提示
          notify('无权访问该工作台，请使用对应角色账号登录', 'error');
          logout();
          setValid(false);
          return;
        }

        setValid(true);
      } finally {
        validatingRef.current = false;
      }
    })();

    return () => { mounted = false; };
  }, [token, logout, location.pathname, notify, user?.role]);

  // 显示加载状态而非空白
  if (valid === null) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-slate-500 text-sm">验证登录状态...</p>
        </div>
      </div>
    );
  }
  
  if (!valid) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};

export default PrivateRoute;
