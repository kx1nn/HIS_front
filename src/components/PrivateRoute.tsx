import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/store';
import { authApi } from '../services/api';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const token = useStore((s) => s.token);
  const logout = useStore((s) => s.logout);
  const user = useStore(s => s.user);
  const notify = useStore(s => s.notify);
  // 若没有 token 直接视为未登录
  const [valid, setValid] = useState<boolean | null>(token ? null : false);

  useEffect(() => {
    let mounted = true;
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
    })();

    return () => { mounted = false; };
  }, [token, logout, location.pathname, notify, user?.role]);

  if (valid === null) return null;
  if (!valid) {
    const LogoutNavigate: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
      React.useEffect(() => { onLogout(); }, [onLogout]);
      return <Navigate to="/login" state={{ from: location }} replace />;
    };
    return <LogoutNavigate onLogout={logout} />;
  }
  return <>{children}</>;
};

export default PrivateRoute;
