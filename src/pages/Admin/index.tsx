import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Users, Shield, Database, Activity, LogOut } from 'lucide-react';
import { useStore } from '../../store/store';

const AdminPage: React.FC = () => {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  return (
    <div className="h-full bg-slate-50 p-8 overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">系统管理后台</h1>
              <p className="text-slate-500">管理员: {user?.name} | 配置系统参数、用户权限及基础数据</p>
            </div>
          </div>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-medium border border-slate-200 bg-white shadow-sm"
          >
            <LogOut size={18} />
            退出系统
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { icon: <Users className="text-blue-500" />, label: '用户管理', desc: '管理医生、护士及管理员账号', count: '24' },
            { icon: <Activity className="text-green-500" />, label: '科室配置', desc: '维护医院科室及诊室信息', count: '12' },
            { icon: <Database className="text-orange-500" />, label: '基础数据', desc: '药品库、价表及字典维护', count: '1.2k' },
            { icon: <Settings className="text-slate-500" />, label: '系统设置', desc: '全局参数及日志监控', count: 'Active' },
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-slate-50 rounded-lg">{item.icon}</div>
                <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded">{item.count}</span>
              </div>
              <h3 className="font-bold text-slate-800 mb-1">{item.label}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-bold text-slate-700">系统运行状态</h2>
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              服务运行中
            </span>
          </div>
          <div className="p-12 text-center text-slate-400">
            <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
              <Settings size={32} className="opacity-20" />
            </div>
            <p>更多管理功能正在开发中...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
