import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Search, AlertTriangle, 
  CheckCircle, Filter, Activity, Clock, LogOut, User, 
  TrendingUp, TrendingDown, BarChart3, Plus, Minus
} from 'lucide-react';
import { pharmacyApi, isCanceledError } from '../../services/api';
import { useStore } from '../../store/store';
import * as logger from '../../services/logger';
import type { Drug, PrescriptionVO, PrescriptionItemVO, InventoryStatsVO, PharmacistStatisticsDTO } from '../../types';

/**
 * 药房工作台组件
 * 功能：查看库存、配药与发药操作、库存管理、统计
 */
const PharmacyStation: React.FC = () => {
  const { user, logout, notify } = useStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'expiry' | 'dispense'>('dispense');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionVO[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [inventoryStats, setInventoryStats] = useState<InventoryStatsVO | null>(null);
  const [todayStats, setTodayStats] = useState<PharmacistStatisticsDTO | null>(null);
  const [stockDialog, setStockDialog] = useState<{ visible: boolean; drugId?: number; drugName?: string; currentStock?: number; quantity: number; reason: string }>({
    visible: false,
    quantity: 0,
    reason: ''
  });
  const [returnDialog, setReturnDialog] = useState<{ visible: boolean; prescriptionId?: number; patientName?: string; reason: string }>({
    visible: false,
    reason: ''
  });

  // helper: normalize various backend shapes to array
  const normalizeToArray = React.useCallback(<T,>(raw: unknown): T[] => {
    if (Array.isArray(raw)) return raw as T[];
    if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r.data)) return r.data as T[];
      if (Array.isArray(r.items)) return r.items as T[];
    }
    return [];
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fetch = async () => {
      setFetchStatus('loading');
      if (!mounted) return;
      try {
        if (activeTab === 'dashboard') {
          // 加载统计数据
          const [invStats, dayStats] = await Promise.all([
            pharmacyApi.getInventoryStats(),
            pharmacyApi.getTodayStatistics()
          ]);
          if (!mounted) return;
          setInventoryStats(invStats);
          setTodayStats(dayStats);
          setFetchStatus('ok');
        } else if (activeTab === 'inventory' || activeTab === 'expiry') {
          const data = await pharmacyApi.getDrugs(searchTerm, undefined, { signal: controller.signal });
          logger.debug('PharmacyStation.getDrugs raw:', data);
          if (!mounted) return;
          const list = normalizeToArray<Drug>(data);
          logger.debug('PharmacyStation.getDrugs normalized length:', list.length);
          setDrugs(list);
          setFetchStatus('ok');
        } else {
          const data = await pharmacyApi.getPendingPrescriptions({ signal: controller.signal });
          logger.debug('PharmacyStation.getPendingPrescriptions raw:', data);
          if (!mounted) return;
          const list = normalizeToArray<PrescriptionVO>(data);
          logger.debug('PharmacyStation.getPendingPrescriptions normalized length:', list.length);
          setPrescriptions(list);
          setFetchStatus('ok');
        }
      } catch (e) {
        if (isCanceledError(e)) return;
        logger.warn('PharmacyStation.fetch', e);
        setFetchStatus('error');
      }
    };

    void fetch();
    return () => { mounted = false; controller.abort(); };
  }, [activeTab, searchTerm, normalizeToArray]);

  const handleDispense = async (id: number) => {
    if (!confirm('确认完成发药？库存将自动扣减。')) return;
    
    const success = await pharmacyApi.dispense(id);
    if (success) {
      notify('发药成功！库存已自动扣减', 'success');
      // 重新加载待发药处方
      try {
        const data = await pharmacyApi.getPendingPrescriptions();
        const list = normalizeToArray<PrescriptionVO>(data);
        setPrescriptions(list);
      } catch {
        // ignore
      }
    } else {
      notify('发药失败，请重试', 'error');
    }
  };

  const handleReturnMedicine = (prescriptionId: number, patientName: string) => {
    setReturnDialog({ visible: true, prescriptionId, patientName, reason: '' });
  };

  const executeReturnMedicine = async () => {
    const { prescriptionId, reason } = returnDialog;
    if (!prescriptionId) return;
    
    if (!reason.trim()) {
      notify('请填写退药原因', 'error');
      return;
    }

    const success = await pharmacyApi.returnMedicine(prescriptionId, reason);
    if (success) {
      notify('退药成功！库存已归还', 'success');
      setReturnDialog({ visible: false, reason: '' });
      // 重新加载待发药处方
      try {
        const data = await pharmacyApi.getPendingPrescriptions();
        const list = normalizeToArray<PrescriptionVO>(data);
        setPrescriptions(list);
      } catch {
        // ignore
      }
    } else {
      notify('退药失败，请重试', 'error');
    }
  };

  const handleStockUpdate = (drugId: number, drugName: string, currentStock: number) => {
    setStockDialog({ visible: true, drugId, drugName, currentStock, quantity: 0, reason: '' });
  };

  const executeStockUpdate = async () => {
    const { drugId, quantity, reason } = stockDialog;
    if (!drugId) return;

    if (quantity === 0) {
      notify('请输入调整数量', 'error');
      return;
    }

    if (!reason.trim()) {
      notify('请填写操作原因', 'error');
      return;
    }

    const success = await pharmacyApi.updateStock(drugId, quantity, reason);
    if (success) {
      notify(`库存${quantity > 0 ? '入库' : '出库'}成功`, 'success');
      setStockDialog({ visible: false, quantity: 0, reason: '' });
      // 重新加载药品列表
      try {
        const data = await pharmacyApi.getDrugs(searchTerm);
        const list = normalizeToArray<Drug>(data);
        setDrugs(list);
      } catch {
        // ignore
      }
    } else {
      notify('库存更新失败，请重试', 'error');
    }
  };

  const getExpiryStatus = (dateStr?: string) => {
    if (!dateStr) return { color: 'text-slate-400', label: '未知', days: 999 };
    const today = new Date();
    const expiry = new Date(dateStr);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { color: 'text-red-600 bg-red-50', label: '已过期', days: diffDays };
    if (diffDays < 30) return { color: 'text-orange-600 bg-orange-50', label: '临期(30天)', days: diffDays };
    if (diffDays < 90) return { color: 'text-yellow-600 bg-yellow-50', label: '预警(90天)', days: diffDays };
    return { color: 'text-green-600 bg-green-50', label: '正常', days: diffDays };
  };

  // helper: format currency values which are strings from API
  const formatCurrency = (v?: string | number | null) => {
    if (v === null || v === undefined) return '--';
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    if (!isFinite(n)) return '--';
    return n.toFixed(2);
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden">
      <div className="bg-white border-b px-6 pt-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex gap-6">
          <button onClick={() => setActiveTab('dashboard')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><BarChart3 size={18}/> 数据统计</button>
          <button onClick={() => setActiveTab('dispense')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'dispense' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Activity size={18}/> 发药作业 {prescriptions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{prescriptions.length}</span>}</button>
          <button onClick={() => setActiveTab('inventory')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Package size={18}/> 药品信息</button>
          <button onClick={() => setActiveTab('expiry')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'expiry' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><AlertTriangle size={18}/> 效期预警</button>
        </div>
        <div className="flex items-center gap-4 mb-4">
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
            title="退出登录"
          >
            <LogOut size={18} />
            退出系统
          </button>
        </div>
      </div>

      {/* Debug banner */}
      <div className="px-6 pt-2">
        <div className="inline-flex items-center gap-3 px-3 py-1 bg-yellow-50 border border-yellow-100 text-yellow-800 text-xs rounded">
          <div className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-medium flex items-center gap-1">
            <User size={12} />
            {user?.name}
          </div>
          <span>当前模块: <strong className="text-slate-700">{activeTab === 'dashboard' ? '数据统计' : activeTab === 'dispense' ? '发药作业' : activeTab === 'inventory' ? '药品信息' : '效期预警'}</strong></span>
          <span>待发处方: <strong className="text-slate-700">{prescriptions.length}</strong></span>
          <span>药品数量: <strong className="text-slate-700">{drugs.length}</strong></span>
          <span>数据状态: <strong className={`ml-1 ${fetchStatus === 'ok' ? 'text-green-700' : fetchStatus === 'loading' ? 'text-blue-700' : fetchStatus === 'error' ? 'text-red-700' : 'text-slate-500'}`}>{fetchStatus}</strong></span>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        {activeTab === 'dashboard' && (
          <div className="h-full flex flex-col gap-6 overflow-y-auto pb-20">
            {/* 今日发药统计 */}
            <div>
              <h3 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><Activity size={20}/> 今日发药统计</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-linear-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm opacity-90">发药单数</span>
                    <CheckCircle size={24} className="opacity-80"/>
                  </div>
                  <div className="text-3xl font-bold">{todayStats?.dispensedCount ?? 0}</div>
                  <div className="text-xs opacity-75 mt-1">今日已发药处方数</div>
                </div>
                <div className="bg-linear-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm opacity-90">发药总额</span>
                    <TrendingUp size={24} className="opacity-80"/>
                  </div>
                  <div className="text-3xl font-bold">¥{formatCurrency(todayStats?.totalAmount ?? 0)}</div>
                  <div className="text-xs opacity-75 mt-1">今日发药总金额</div>
                </div>
                <div className="bg-linear-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm opacity-90">药品数量</span>
                    <Package size={24} className="opacity-80"/>
                  </div>
                  <div className="text-3xl font-bold">{todayStats?.totalItems ?? 0}</div>
                  <div className="text-xs opacity-75 mt-1">今日发药药品总数</div>
                </div>
              </div>
            </div>

            {/* 库存统计 */}
            <div>
              <h3 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart3 size={20}/> 库存统计</h3>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
                  <div className="text-sm text-slate-500 mb-1">药品总数</div>
                  <div className="text-2xl font-bold text-slate-800">{inventoryStats?.totalMedicines ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-1">种</div>
                </div>
                <div className="bg-green-50 border border-green-100 p-5 rounded-xl shadow-sm">
                  <div className="text-sm text-green-600 mb-1">正常库存</div>
                  <div className="text-2xl font-bold text-green-700">{inventoryStats?.inStockCount ?? 0}</div>
                  <div className="text-xs text-green-500 mt-1">{inventoryStats?.inStockRate?.toFixed(1) ?? 0}%</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 p-5 rounded-xl shadow-sm">
                  <div className="text-sm text-yellow-600 mb-1">低库存</div>
                  <div className="text-2xl font-bold text-yellow-700">{inventoryStats?.lowStockCount ?? 0}</div>
                  <div className="text-xs text-yellow-500 mt-1">{inventoryStats?.lowStockRate?.toFixed(1) ?? 0}%</div>
                </div>
                <div className="bg-red-50 border border-red-100 p-5 rounded-xl shadow-sm">
                  <div className="text-sm text-red-600 mb-1">缺货</div>
                  <div className="text-2xl font-bold text-red-700">{inventoryStats?.outOfStockCount ?? 0}</div>
                  <div className="text-xs text-red-500 mt-1">{inventoryStats?.outOfStockRate?.toFixed(1) ?? 0}%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dispense' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full overflow-y-auto pb-20">
            {prescriptions.length === 0 ? (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-400"><CheckCircle size={48} className="mb-4 text-slate-200" /><p>当前无待发药处方</p></div>
            ) : (
              prescriptions.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-80">
                  <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><div><div className="font-bold text-slate-800">{p.patientName} <span className="text-xs font-normal text-slate-500">({p.genderDesc || '—'} {p.age}岁)</span></div><div className="text-xs text-slate-400 mt-0.5">{p.regNo}</div></div><div className="text-right"><div className="text-xs text-slate-500">待收</div><div className="text-lg font-bold text-orange-600">¥{p.totalAmount}</div></div></div>
                  <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white">
                    {p.items.map((item: PrescriptionItemVO, i: number) => (
                      <div key={i} className="flex justify-between items-start text-sm">
                        <div>
                          <div className="font-medium text-slate-700">{item.drugName}</div>
                          <div className="text-xs text-slate-400">{item.spec}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">x{item.count}</div>
                          <div className="text-xs text-slate-400">{item.usage}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t bg-slate-50 flex gap-2">
                    <button onClick={() => handleDispense(p.id)} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-1">
                      <CheckCircle size={16}/> 确认发药
                    </button>
                    <button onClick={() => handleReturnMedicine(p.id, p.patientName)} className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg font-medium text-sm transition-all flex items-center gap-1" title="退药">
                      <TrendingDown size={16}/> 退药
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <div className="relative w-64"><Search size={16} className="absolute left-3 top-2.5 text-slate-400"/><input className="w-full pl-9 p-2 border rounded-lg text-sm focus:border-teal-500 outline-none" placeholder="搜索药品名称/编码..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={async e => {
                          if (e.key === 'Enter') {
                            try {
                              const data = await pharmacyApi.getDrugs(searchTerm);
                              const list = normalizeToArray<Drug>(data);
                              setDrugs(list);
                            } catch {
                              // ignore
                            }
                          }
                }}/></div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 sticky top-0 z-10"><tr><th className="p-4">编码</th><th className="p-4">药品名称</th><th className="p-4">规格/单位</th><th className="p-4">厂家</th><th className="p-4">单价</th>{user?.role === 'pharmacy' && <th className="p-4">进货价</th>}{user?.role === 'pharmacy' && <th className="p-4">利润率</th>}<th className="p-4">库存</th><th className="p-4">状态</th><th className="p-4">操作</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {drugs.map(drug => (
                    <tr key={drug.id} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500">{drug.medicineCode}</td>
                      <td className="p-4 font-bold text-slate-700">{drug.name}</td>
                      <td className="p-4 text-slate-500">{drug.spec} / {drug.unit}</td>
                      <td className="p-4 text-slate-500">{drug.manufacturer}</td>
                      <td className="p-4 text-orange-600">¥{formatCurrency(drug.price)}</td>
                      {user?.role === 'pharmacy' && <td className="p-4 text-slate-700">¥{drug.purchasePrice != null ? formatCurrency(drug.purchasePrice) : '--'}</td>}
                      {user?.role === 'pharmacy' && <td className="p-4 text-slate-700">{drug.profitMargin != null ? `${drug.profitMargin}%` : '--'}</td>}
                      <td className="p-4"><span className={`font-bold ${drug.stock < (drug.minStock ?? 0) ? 'text-red-500' : 'text-slate-700'}`}>{drug.stock}</span></td>
                      <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full ${drug.uiStatus === 'expired' ? 'bg-red-100 text-red-600' : drug.uiStatus === 'low_stock' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{drug.uiStatus === 'expired' ? '过期' : drug.uiStatus === 'low_stock' ? '缺货' : '正常'}</span></td>
                      <td className="p-4">
                        <button 
                          onClick={() => handleStockUpdate(drug.id, drug.name, drug.stock)} 
                          className="px-3 py-1 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                        >
                          <Package size={14}/> 库存调整
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'expiry' && (
          <div className="h-full flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-4 mb-2">
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-4"><div className="p-3 bg-red-100 rounded-lg text-red-600"><AlertTriangle/></div><div><div className="text-2xl font-bold text-red-700">{drugs.filter(d=>getExpiryStatus(d.expiryDate ?? undefined).days<0).length}</div><div className="text-xs text-red-500">已过期品种</div></div></div>
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-center gap-4"><div className="p-3 bg-orange-100 rounded-lg text-orange-600"><Clock/></div><div><div className="text-2xl font-bold text-orange-700">{drugs.filter(d=>{const x=getExpiryStatus(d.expiryDate ?? undefined).days; return x>=0 && x<30}).length}</div><div className="text-xs text-orange-500">30天内过期</div></div></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b font-bold text-slate-700 flex items-center gap-2"><Filter size={18}/> 效期监控明细</div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 sticky top-0"><tr><th className="p-4">药品名称</th><th className="p-4">批号</th><th className="p-4">有效期至</th><th className="p-4">剩余天数</th><th className="p-4">预警状态</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {drugs.map(d => ({ ...d, ...getExpiryStatus(d.expiryDate ?? undefined) })).sort((a,b) => a.days - b.days).map(drug => (
                      <tr key={drug.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium">{drug.name}</td>
                        <td className="p-4 font-mono text-slate-500">{drug.batchNumber}</td>
                        <td className="p-4 font-mono font-bold text-slate-700">{drug.expiryDate}</td>
                        <td className="p-4 font-bold">{drug.days} 天</td>
                        <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full ${drug.color}`}>{drug.label}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 库存调整对话框 */}
      {stockDialog.visible && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setStockDialog({ visible: false, quantity: 0, reason: '' })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-teal-600"/> 库存调整 - {stockDialog.drugName}
              </h3>
              <p className="text-sm text-slate-500 mt-1">当前库存：{stockDialog.currentStock} {/* 可加单位 */}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">调整数量（正数=入库，负数=出库）</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setStockDialog({...stockDialog, quantity: stockDialog.quantity - 10})} 
                    className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                  >
                    <Minus size={18}/>
                  </button>
                  <input 
                    type="number" 
                    value={stockDialog.quantity} 
                    onChange={e => setStockDialog({...stockDialog, quantity: parseInt(e.target.value) || 0})}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-center font-bold text-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none"
                    placeholder="0"
                  />
                  <button 
                    onClick={() => setStockDialog({...stockDialog, quantity: stockDialog.quantity + 10})} 
                    className="p-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-colors"
                  >
                    <Plus size={18}/>
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  调整后库存：{(stockDialog.currentStock ?? 0) + stockDialog.quantity}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">操作原因 <span className="text-red-500">*</span></label>
                <textarea 
                  value={stockDialog.reason} 
                  onChange={e => setStockDialog({...stockDialog, reason: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg resize-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200 outline-none"
                  rows={3}
                  placeholder="请填写调整原因（如：采购入库、盘点调整、损耗报损等）"
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3">
              <button 
                onClick={() => setStockDialog({ visible: false, quantity: 0, reason: '' })} 
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={executeStockUpdate} 
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold transition-colors"
              >
                确认调整
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 退药对话框 */}
      {returnDialog.visible && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setReturnDialog({ visible: false, reason: '' })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <TrendingDown size={20} className="text-orange-600"/> 退药申请 - {returnDialog.patientName}
              </h3>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">退药原因 <span className="text-red-500">*</span></label>
              <textarea 
                value={returnDialog.reason} 
                onChange={e => setReturnDialog({...returnDialog, reason: e.target.value})}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg resize-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none"
                rows={4}
                placeholder="请详细填写退药原因..."
                autoFocus
              />
            </div>
            <div className="p-6 border-t flex gap-3">
              <button 
                onClick={() => setReturnDialog({ visible: false, reason: '' })} 
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={executeReturnMedicine} 
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold transition-colors"
              >
                确认退药
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import ErrorBoundary from '../../components/ErrorBoundary';

const WrappedPharmacyStation: React.FC = () => (
  <ErrorBoundary>
    <PharmacyStation />
  </ErrorBoundary>
);

export default WrappedPharmacyStation;