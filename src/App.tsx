// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import NurseStation from './pages/NurseStation';
import DoctorStation from './pages/DoctorStation';
import PharmacyStation from './pages/PharmacyStation';
import AdminPage from './pages/Admin';
import PrivateRoute from './components/PrivateRoute';
import ToastContainer from './components/ToastContainer';
import ErrorBoundary from './components/ErrorBoundary';

// 使用独立组件 `src/components/PrivateRoute.tsx` 提供路由守卫（包含 token 验证）

// --- App 根组件 ---
/**
 * 根组件：路由配置与全局组件挂载（ErrorBoundary / Toast）
 */
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="h-full w-full overflow-hidden bg-slate-50">
          <ToastContainer />
          <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          {/* 护士站 */}
          <Route path="/nurse" element={
            <PrivateRoute>
              <NurseStation />
            </PrivateRoute>
          } />

          {/* 医生站 */}
          <Route path="/doctor" element={
            <PrivateRoute>
              <DoctorStation />
            </PrivateRoute>
          } />

          <Route path="/pharmacy" element={
            <PrivateRoute>
              <PharmacyStation />
            </PrivateRoute>
          } />

          {/* 后台 */}
          <Route path="/admin" element={
            <PrivateRoute>
              <AdminPage />
            </PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  </ErrorBoundary>
  );
}

export default App;