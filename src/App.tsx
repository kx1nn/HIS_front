// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import NurseStation from './pages/NurseStation';
import PharmacyStation from './pages/PharmacyStation';
import PrivateRoute from './components/PrivateRoute';
import ToastContainer from './components/ToastContainer';

// 使用独立组件 `src/components/PrivateRoute.tsx` 提供路由守卫（包含 token 验证）

// --- App 根组件 ---
function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
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

        <Route path="/pharmacy" element={
          <PrivateRoute>
            <PharmacyStation />
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