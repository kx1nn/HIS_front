import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Shield, Activity, LogOut, AlertTriangle, RefreshCw, Trash2, FileText, CreditCard } from 'lucide-react';
import { useStore } from '../../store/store';
import { registrationApi, chargeApi, basicApi } from '../../services/api';
import { getRecentLogs, clearLogs, type LogEntry } from '../../services/logger';

const AdminPage: React.FC = () => {
  const { user, logout } = useStore();
  const navigate = useNavigate();

  
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    registrationCount: 0,
    revenue: 0,
    doctorCount: 0,
    deptCount: 0
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. 挂号统计 (今日)
      const today = new Date().toISOString().split('T')[0];
      const regs = await registrationApi.getList({ visitDate: today });
      
      // 2. 收费统计 (今日日报)
      const report = await chargeApi.getDailyReport({ date: today });
      
      // 3. 员工统计 (医生总数)
      const doctors = await basicApi.getDoctors();
      
      // 4. 科室统计
      const depts = await basicApi.getDepartments();

      setStats({
        registrationCount: regs.length,
        revenue: report?.totalAmount || 0,
        doctorCount: doctors.length,
        deptCount: depts.length
      });

      // 5. 加载日志
      setLogs([...getRecentLogs()]);

    } catch (err) {
      console.error('Admin load data failed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // 简单的轮询，每30秒刷新一次日志
    const timer = setInterval(() => {
      setLogs([...getRecentLogs()]);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleClearLogs = () => {
    clearLogs();
    setLogs([]);
  };

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
              <p className="text-slate-500">管理员: {user?.name} | 监控系统运行状态与异常日志</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all font-medium border border-slate-200 bg-white shadow-sm"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              刷新数据
            </button>
            <button 
              onClick={() => { logout(); navigate('/login'); }}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all font-medium border border-slate-200 bg-white shadow-sm"
            >
              <LogOut size={18} />
              退出
            </button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><FileText size={24} /></div>
              <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded">今日</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">今日挂号量</h3>
            <p className="text-3xl font-bold text-slate-800">{stats.registrationCount}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CreditCard size={24} /></div>
              <span className="text-xs font-bold bg-green-100 text-green-600 px-2 py-1 rounded">今日</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">今日营收</h3>
            <p className="text-3xl font-bold text-slate-800">¥{stats.revenue.toFixed(2)}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Users size={24} /></div>
              <span className="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-1 rounded">在职</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">医生总数</h3>
            <p className="text-3xl font-bold text-slate-800">{stats.doctorCount}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Activity size={24} /></div>
              <span className="text-xs font-bold bg-purple-100 text-purple-600 px-2 py-1 rounded">配置</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">科室数量</h3>
            <p className="text-3xl font-bold text-slate-800">{stats.deptCount}</p>
          </div>
        </div>

        {/* 错误日志面板 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-125">
          <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} />
              <h2 className="font-bold text-slate-700">系统异常日志监控</h2>
              <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{logs.length} 条记录</span>
            </div>
            <button 
              onClick={handleClearLogs}
              className="text-xs flex items-center gap-1 text-slate-500 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14} /> 清空日志
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-0">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Shield size={48} className="mb-4 opacity-20" />
                <p>系统运行正常，暂无异常日志</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 w-40">时间</th>
                    <th className="px-6 py-3 w-24">级别</th>
                    <th className="px-6 py-3">消息内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 font-mono">
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          log.level === 'error' ? 'bg-red-100 text-red-700' :
                          log.level === 'warn' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-700 break-all">
                        {log.message}
                        {log.details && log.details.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-blue-500 hover:underline">查看详情</summary>
                            <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
