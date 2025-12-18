// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Activity } from 'lucide-react';
import LoginPage from './pages/Login';
import NurseStation from './pages/NurseStation';
import { useStore, type AppState } from './store/store';

// --- 布局组件 (包含顶部导航) ---
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 页面标题映射
  const getPageTitle = () => {
    if (location.pathname.includes('nurse')) return '门诊护士工作台';
    if (location.pathname.includes('doctor')) return '医生诊疗工作台';
    if (location.pathname.includes('admin')) return '后台管理系统';
    return 'HIS 系统';
  };

  return (
    <div className="h-screen flex flex-col text-slate-700 bg-slate-100">
      {/* 顶部 Header */}
      <header className="h-16 bg-slate-800 text-white flex items-center justify-between px-6 shadow-md z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">HIS 智慧医疗系统</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Hospital Info System</p>
          </div>
          <div className="h-6 w-px bg-slate-600 mx-2"></div>
          <span className="text-sm font-medium text-slate-200 bg-slate-700 px-3 py-1 rounded-full border border-slate-600">
            {getPageTitle()}
          </span>
        </div>

        <div className="flex items-center gap-6">
          {/* 用户信息卡片 */}
          <div className="flex items-center gap-3 bg-slate-700/50 px-4 py-1.5 rounded-full border border-slate-600">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 flex items-center justify-center text-xs font-bold text-white shadow-inner">
              {user?.name?.[0] || 'U'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{user?.name}</span>
              <span className="text-[10px] text-slate-400 uppercase leading-tight mt-0.5">{user?.dept}</span>
            </div>
          </div>
          
          <button 
            onClick={handleLogout} 
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-full" 
            title="退出登录"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};

// --- 路由守卫 ---
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = useStore((state: AppState) => state.user);
  return user ? <MainLayout>{children}</MainLayout> : <Navigate to="/login" replace />;
};

// --- App 根组件 ---
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* 护士站 */}
        <Route path="/nurse" element={
          <PrivateRoute>
            <NurseStation />
          </PrivateRoute>
        } />

        {/* 医生站 (占位) */}
        <Route path="/doctor" element={
          <PrivateRoute>
            <div className="flex items-center justify-center h-full text-slate-400">医生工作台开发中...</div>
          </PrivateRoute>
        } />

        {/* 后台 (占位) */}
        <Route path="/admin" element={
          <PrivateRoute>
            <div className="flex items-center justify-center h-full text-slate-400">后台管理开发中...</div>
          </PrivateRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;