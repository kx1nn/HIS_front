import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/store';
import { authApi } from '../services/api';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  // 若没有 token 直接视为未登录
  const [valid, setValid] = useState<boolean | null>(token ? null : false);

  useEffect(() => {
    let mounted = true;

    // 开发环境下优先绕过验证并注入临时用户，避免在渲染期触发 localStorage 操作
    if (import.meta.env.DEV && !token) {
      try {
        localStorage.setItem('his_token', 'dev-bypass-token');
        localStorage.setItem('his_user', JSON.stringify({ name: 'Dev', userId: 1 }));
      } catch {
        // ignore
      }
      setValid(true);
      return () => { mounted = false; };
    }

    if (!token) {
      // 无 token，初始已为未登录，无需再次 setState
      return () => { mounted = false; };
    }

    (async () => {
      const ok = await authApi.validate();
      if (!mounted) return;
      if (!ok) {
        logout();
        setValid(false);
      } else {
        setValid(true);
      }
    })();

    return () => { mounted = false; };
  }, [token, logout]);

  if (valid === null) return null;
  if (!valid) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

export default PrivateRoute;
