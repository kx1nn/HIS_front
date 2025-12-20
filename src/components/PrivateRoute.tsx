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
    if (!token) {
      // 无 token，初始已为未登录，无需再次 setState
      return () => { mounted = false; };
    }

    (async () => {
      const ok = await authApi.validate();
      if (!mounted) return;
      if (!ok) {
        logout();
      }
      // set validation result once; ESLint rule flags setState-in-effect here but this
      // is an intended async validation. Disable the specific rule for this line.
       
      setValid(Boolean(ok));
    })();

    return () => { mounted = false; };
  }, [token, logout]);

  if (valid === null) return null;
  if (!valid) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
};

export default PrivateRoute;
