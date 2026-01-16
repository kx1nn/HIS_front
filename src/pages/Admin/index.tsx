import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Activity, LogOut, AlertTriangle, RefreshCw, Trash2, FileText, CreditCard } from 'lucide-react';
import { useStore } from '../../store/store';
import { registrationApi, chargeApi, basicApi } from '../../services/api';
import { getRecentLogs, clearLogs, type LogEntry } from '../../services/logger';

/**
 * 管理后台页面组件（管理员视角）
 * 功能：统计、日志查看与系统配置入口
 */
const AdminPage: React.FC = () => {
  const { user, logout } = useStore();

  // Helper to extract error message and optional status from unknown errors
  const getErrorMessage = (e: unknown): { message: string; status?: number } => {
    if (!e || typeof e !== 'object') return { message: String(e) };
    const eo = e as { response?: { status?: number; data?: { message?: unknown } }; message?: unknown };
    const status = eo.response?.status;
    const msg = typeof eo.response?.data?.message === 'string' ? (eo.response!.data!.message as string) : (typeof eo.message === 'string' ? (eo.message as string) : String(e));
    return { message: msg, status };
  };
  const navigate = useNavigate();

  
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    registrationCount: 0,
    revenue: 0,
    doctorCount: 0,
    deptCount: 0
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // 退费统计弹窗与数据
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundStats, setRefundStats] = useState<import('../../types').DailySettlementVO | null>(null);
  // 退费弹窗/批量退费状态
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundTargetIds, setRefundTargetIds] = useState<number[]>([]);
  const [refundReasonInput, setRefundReasonInput] = useState('');
  const [selectedChargeIds, setSelectedChargeIds] = useState<number[]>([]);
  const [batchRefundProcessing, setBatchRefundProcessing] = useState(false);

  // 退费管理弹窗与列表（管理员处理退费）
  const [showRefundManager, setShowRefundManager] = useState(false);
  const [chargesPage, setChargesPage] = useState<import('../../types').PageChargeVO | null>(null);
  const [chargePageNo, setChargePageNo] = useState(0);

  const loadCharges = React.useCallback(async (page = 0, size = 5, status = 1) => {
    try {
      const res = await chargeApi.getList({ page, size, status });
      if (res) setChargesPage(res);
    } catch (e) {
      console.error('加载收费单失败', e);
    }
  }, []);

  // 打开退费弹窗（支持单个或多个 id）
  const openRefundModalFor = (ids: number[]) => {
    setRefundTargetIds(ids);
    setRefundReasonInput('');
    setRefundModalOpen(true);
  };

  // 执行退费（单个或批量）
  const confirmRefund = async () => {
    const ids = refundTargetIds;
    if (!ids || ids.length === 0) return;
    setBatchRefundProcessing(true);
    try {
      for (const id of ids) {
        await chargeApi.refund(id, { refundReason: refundReasonInput });
      }
      useStore.getState().notify(`退费单已处理(数量:${ids.length} )`, 'success');
      // 刷新列表与统计
      await loadCharges(chargePageNo);
      const today = new Date().toISOString().split('T')[0];
      const rpt = await chargeApi.getDailyReport({ date: today });
      setRefundStats(rpt);      // 更新首页统计（净营收）并广播变更，供其他页面监听并刷新
      setStats(prev => ({ ...prev, revenue: Number(rpt?.netCollection ?? rpt?.totalAmount ?? prev.revenue) }));
      window.dispatchEvent(new CustomEvent('charges:updated', { detail: { source: 'admin-batch', count: ids.length } }));    } catch (e) {
      console.error('批量退费失败', e);
      const { message: msg } = getErrorMessage(e);
      useStore.getState().notify('退费失败：' + msg, 'error');
    } finally {
      setBatchRefundProcessing(false);
      setRefundModalOpen(false);
      setRefundTargetIds([]);
      setSelectedChargeIds([]);
    }
  };

  // 展示今日收费统计（用于点击今日营收）
  const showDailyReport = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const rpt = await chargeApi.getDailyReport({ date: today });
      setRefundStats(rpt);
      setShowRefundModal(true);
    } catch (e) {
      console.error('加载今日收费统计失败', e);
    } finally {
      setLoading(false);
    }
  };

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 1. 挂号统计 (今日)
      const today = new Date().toISOString().split('T')[0];
      const regs = await registrationApi.getList({ visitDate: today });
      
      // 2. 收费统计 (今日日报)
      const report = await chargeApi.getDailyReport({ date: today });
      
      // 3. 科室统计：先获取科室，再按科室并行获取医生列表以统计医生总数（避免缺少 deptId 的 400 错误）
      const depts = await basicApi.getDepartments();
      let doctors: import('../../services/api').RawDoctor[] = [];
      try {
        const lists = await Promise.allSettled((depts || []).map(d => basicApi.getDoctors(d.id)));
        for (const r of lists) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) doctors = doctors.concat(r.value as import('../../services/api').RawDoctor[]);
        }
      } catch (e) {
        console.error('聚合医生列表失败', e);
      }
      // 去重（按 id）
      const uniqueDoctors = Array.from(new Map((doctors || []).map((doc: import('../../services/api').RawDoctor) => [doc.id, doc])).values());

      setStats({
        registrationCount: regs.length,
        // 使用净收款（排除退费）显示今日营收
        revenue: Number(report?.netCollection ?? report?.totalAmount ?? 0),
        doctorCount: uniqueDoctors.length,
        deptCount: depts.length
      });

      // 5. 加载日志
      setLogs([...getRecentLogs()]);

      // 6. 加载最近收费单（预览）
      loadCharges(0);

    } catch (err) {
      const { message: msg } = getErrorMessage(err);
      console.error('Admin load data failed', msg);
    } finally {
      setLoading(false);
    }
  }, [loadCharges]);

  useEffect(() => {
    loadData();
    // 监听全局 charges 更新事件（跨页面触发）以刷新统计
    const onChargesUpdated = () => loadData();
    window.addEventListener('charges:updated', onChargesUpdated as EventListener);

    // 简单的轮询，每30秒刷新一次日志
    const timer = setInterval(() => {
      setLogs([...getRecentLogs()]);
    }, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('charges:updated', onChargesUpdated as EventListener);
    };
  }, [loadData]);

  const handleClearLogs = () => {
    clearLogs();
    setLogs([]);
  };

  return (
    <div className="h-full bg-slate-50 p-8 overflow-auto select-none">
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
              onClick={() => navigate('/admin/audit-logs')}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all font-medium border border-slate-200 bg-white shadow-sm"
            >
              <FileText size={18} />
              审计日志
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

          <div role="button" tabIndex={0} onClick={showDailyReport} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') showDailyReport(); }} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg"><CreditCard size={24} /></div>
              <span className="text-xs font-bold bg-green-100 text-green-600 px-2 py-1 rounded">今日</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">今日营收</h3>
            <p className="text-3xl font-bold text-slate-800">¥{stats.revenue.toFixed(2)}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><CreditCard size={24} /></div>
              <span className="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-1 rounded">收费</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium mb-1">退费管理</h3>
            <p className="text-3xl font-bold text-slate-800">查看/处理退费</p>
            <div className="text-xs text-slate-400 mt-2 mb-3">最近收费记录（可直接在此处退费）</div>

            {/* 预览待处理收费单（展示第一条已缴费待处理） */}
            <div className="space-y-2">
              {chargesPage && chargesPage.content && chargesPage.content.length > 0 ? (
                (() => {
                  const pending = (chargesPage.content || []).find(x => x.status === 1);
                  if (!pending) return <div className="text-xs text-slate-400">暂无待处理收费单</div>;
                  return (
                    <div key={pending.id} className="flex items-center justify-between text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{pending.chargeNo} · {pending.patientName}</div>
                        <div className="text-xs text-slate-500">¥{Number(pending.totalAmount).toFixed(2)} · {pending.statusDesc}</div>
                      </div>
                      <div className="ml-4">
                        <button onClick={() => { setRefundTargetIds([pending.id]); setRefundReasonInput(''); loadCharges(0); setShowRefundManager(true); setRefundModalOpen(true); }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded">处理退费</button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-xs text-slate-400">暂无收费记录</div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { loadCharges(0); setShowRefundManager(true); }} className="px-3 py-1 text-xs bg-slate-100 rounded">管理</button>
            </div>
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

        {/* 退费统计弹窗 */}
        {showRefundModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowRefundModal(false)}></div>
            <div className="relative w-full max-w-2xl bg-white p-6 rounded-lg shadow-xl z-10">
              <div className="flex justify-between items-center mb-4">
                <div className="text-lg font-bold">今日收费 & 退费统计</div>
                <button onClick={() => setShowRefundModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              {refundStats ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-slate-500 mb-1">到账金额</div>
                    <div className="text-3xl font-bold text-green-600">¥{Number(refundStats.netCollection).toFixed(2)}</div>
                    <div className="text-xs text-slate-400 mt-2">今日收费单数：{refundStats.totalCharges}</div>
                    <div className="text-xs text-slate-400">总收入：¥{Number(refundStats.totalAmount).toFixed(2)}</div>
                    <div className="text-xs text-red-500 mt-2">退费：{refundStats.refunds.count} 单 ¥{refundStats.refunds.amount}</div>
                    
                    {/* 退费比例图表 */}
                    <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                      <div className="text-xs text-slate-500 mb-2">退费比例</div>
                      {(() => {
                        const totalAmt = Number(refundStats.totalAmount);
                        const refundAmt = Number(refundStats.refunds.amount);
                        const refundRate = totalAmt > 0 ? (refundAmt / totalAmt * 100) : 0;
                        const netRate = 100 - refundRate;
                        return (
                          <>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-6 bg-slate-200 rounded-full overflow-hidden flex">
                                <div className="bg-green-500 h-full" style={{ width: `${netRate}%` }} title={`到账 ${netRate.toFixed(1)}%`}></div>
                                <div className="bg-red-400 h-full" style={{ width: `${refundRate}%` }} title={`退费 ${refundRate.toFixed(1)}%`}></div>
                              </div>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-green-600">✓ 到账 {netRate.toFixed(1)}%</span>
                              <span className="text-red-500">⨯ 退费 {refundRate.toFixed(1)}%</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-slate-500 mb-2">支付方式分布</div>
                    <div className="space-y-2">
                      {(() => {
                        const breakdown = (refundStats.paymentBreakdown || {}) as import('../../types').PaymentBreakdownVO;
                        const values = Object.values(breakdown).map(x => Number(x.amount || 0));
                        const max = values.length ? Math.max(...values) : 1;
                        return Object.entries(breakdown).map(([k, v]) => {
                          const amt = Number(v.amount || 0);
                          const pct = Math.round((amt / max) * 100);
                          return (
                            <div key={k} className="flex items-center gap-2">
                              <div className="w-24 text-xs text-slate-600">{k}</div>
                              <div className="flex-1 bg-slate-100 rounded overflow-hidden h-4">
                                <div className="h-4 bg-blue-500" style={{ width: `${pct}%` }}></div>
                              </div>
                              <div className="w-20 text-right text-xs text-slate-600">¥{amt.toFixed(2)}</div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400">加载中…</div>
              )}

              <div className="mt-6 flex justify-end">
                <button onClick={() => setShowRefundModal(false)} className="px-4 py-2 bg-slate-100 rounded hover:bg-slate-200 transition-colors">关闭</button>
              </div>
            </div>
          </div>
        )}

        {/* 退费管理弹窗（列表与退费操作） */}
        {showRefundManager && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* refund reason modal */}
            {refundModalOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/40" onClick={() => setRefundModalOpen(false)}></div>
                <div className="relative w-full max-w-md bg-white p-6 rounded-lg shadow-xl z-10">
                  <div className="text-lg font-bold mb-2">请输入退费原因（可选）</div>
                  <textarea value={refundReasonInput} onChange={e => setRefundReasonInput(e.target.value)} className="w-full p-2 border rounded h-24" />
                  <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => setRefundModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded">取消</button>
                    <button disabled={batchRefundProcessing} onClick={confirmRefund} className="px-4 py-2 bg-red-600 text-white rounded">确定</button>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute inset-0 bg-black/40" onClick={() => setShowRefundManager(false)}></div>
            <div className="relative w-full max-w-3xl bg-white p-6 rounded-lg shadow-xl z-10">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-lg font-bold">退费管理</div>
                  <div className="text-xs text-slate-500">在此可以按条件查询收费单并进行退费</div>
                </div>
                <button onClick={() => setShowRefundManager(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <div className="mb-4 flex gap-2">
                <input placeholder="搜索 账单号/患者" className="p-2 border rounded text-sm flex-1" onKeyDown={e => { if (e.key === 'Enter') loadCharges(0); }} />
                <button onClick={() => loadCharges(0)} className="px-3 py-1 bg-slate-100 rounded">查询</button>
                <button disabled={selectedChargeIds.length === 0} onClick={() => openRefundModalFor(selectedChargeIds)} className={`px-3 py-1 bg-red-600 text-white rounded ${selectedChargeIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>批量退费 ({selectedChargeIds.length})</button>
              </div>

              <div className="overflow-auto max-h-72">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 w-8"><input type="checkbox" className="form-checkbox" onChange={e => {
                        if (e.target.checked) setSelectedChargeIds((chargesPage?.content || []).map(c => c.id));
                        else setSelectedChargeIds([]);
                      }} checked={Boolean(chargesPage?.content && selectedChargeIds.length === (chargesPage.content?.length || 0))} /></th>
                      <th className="px-3 py-2">单号</th>
                      <th className="px-3 py-2">患者</th>
                      <th className="px-3 py-2">金额</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {chargesPage && chargesPage.content && chargesPage.content.length > 0 ? (
                      chargesPage.content.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2"><input type="checkbox" checked={selectedChargeIds.includes(c.id)} onChange={e => {
                            if (e.target.checked) setSelectedChargeIds(prev => [...prev, c.id]);
                            else setSelectedChargeIds(prev => prev.filter(x => x !== c.id));
                          }} /></td>
                          <td className="px-3 py-2">{c.chargeNo}</td>
                          <td className="px-3 py-2">{c.patientName}</td>
                          <td className="px-3 py-2">¥{Number(c.totalAmount).toFixed(2)}</td>
                          <td className="px-3 py-2">{c.statusDesc}</td>
                          <td className="px-3 py-2">
                            {c.status === 1 ? (
                              <button disabled={batchRefundProcessing} onClick={() => openRefundModalFor([c.id])} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded">退费</button>
                            ) : (
                              <span className="text-xs text-slate-400">不可退</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">暂无收费记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-slate-600">共 {chargesPage?.totalElements ?? 0} 条</div>
                <div className="flex gap-2">
                  <button disabled={!chargesPage || chargePageNo <= 0} onClick={() => { const p = Math.max(0, chargePageNo - 1); setChargePageNo(p); loadCharges(p); }} className="px-3 py-1 bg-slate-100 rounded">上一页</button>
                  <button disabled={!chargesPage || (chargesPage.totalPages !== undefined && chargePageNo >= (chargesPage.totalPages - 1))} onClick={() => { const p = (chargesPage?.number ?? 0) + 1; setChargePageNo(p); loadCharges(p); }} className="px-3 py-1 bg-slate-100 rounded">下一页</button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPage;
