import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Search, AlertTriangle, 
  CheckCircle, Filter, Activity, Clock, LogOut, User
} from 'lucide-react';
import { pharmacyApi, isCanceledError } from '../../services/api';
import { useStore } from '../../store/store';
import * as logger from '../../services/logger';
import type { Drug, PrescriptionVO, PrescriptionItemVO } from '../../types';

const PharmacyStation: React.FC = () => {
  const { user, logout } = useStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'expiry' | 'dispense'>('dispense');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionVO[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

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
        if (activeTab === 'inventory' || activeTab === 'expiry') {
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
    if (confirm('确认完成发药？库存将自动扣减。')) {
      await pharmacyApi.dispense(id);
      // 重新加载待发药处方
      try {
        const data = await pharmacyApi.getPendingPrescriptions();
        const list = normalizeToArray<PrescriptionVO>(data);
        setPrescriptions(list);
      } catch {
        // ignore
      }
      useStore.getState().notify('发药成功！', 'success');
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

  return (
    <div className="flex h-full flex-col bg-slate-50 overflow-hidden">
      <div className="bg-white border-b px-6 pt-4 flex justify-between items-center shadow-sm z-10">
        <div className="flex gap-6">
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

      {/* Debug banner: shows fetch status and counts to help diagnose empty/304 issues */}
      <div className="px-6 pt-2">
        <div className="inline-flex items-center gap-3 px-3 py-1 bg-yellow-50 border border-yellow-100 text-yellow-800 text-xs rounded">
          <div className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-medium flex items-center gap-1">
            <User size={12} />
            {user?.name}
          </div>
          <span>当前模块: <strong className="text-slate-700">{activeTab === 'dispense' ? '发药作业' : activeTab === 'inventory' ? '药品信息' : '效期预警'}</strong></span>
          <span>待发处方: <strong className="text-slate-700">{prescriptions.length}</strong></span>
          <span>药品数量: <strong className="text-slate-700">{drugs.length}</strong></span>
          <span>数据状态: <strong className={`ml-1 ${fetchStatus === 'ok' ? 'text-green-700' : fetchStatus === 'loading' ? 'text-blue-700' : fetchStatus === 'error' ? 'text-red-700' : 'text-slate-500'}`}>{fetchStatus}</strong></span>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-hidden">
        {activeTab === 'dispense' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full overflow-y-auto pb-20">
            {prescriptions.length === 0 ? (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-slate-400"><CheckCircle size={48} className="mb-4 text-slate-200" /><p>当前无待发药处方</p></div>
            ) : (
              prescriptions.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-80">
                  <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><div><div className="font-bold text-slate-800">{p.patientName} <span className="text-xs font-normal text-slate-500">({p.gender === 1 ? '男' : '女'} {p.age}岁)</span></div><div className="text-xs text-slate-400 mt-0.5">{p.regNo}</div></div><div className="text-right"><div className="text-xs text-slate-500">待收</div><div className="text-lg font-bold text-orange-600">¥{p.totalAmount}</div></div></div>
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
                  <div className="p-3 border-t bg-slate-50"><button onClick={() => handleDispense(p.id)} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all">确认发药 / 出库</button></div>
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
              <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 sticky top-0 z-10"><tr><th className="p-4">编码</th><th className="p-4">药品名称</th><th className="p-4">规格/单位</th><th className="p-4">厂家</th><th className="p-4">单价</th><th className="p-4">库存</th><th className="p-4">状态</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {drugs.map(drug => (
                    <tr key={drug.id} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500">{drug.medicineCode}</td>
                      <td className="p-4 font-bold text-slate-700">{drug.name}</td>
                      <td className="p-4 text-slate-500">{drug.spec} / {drug.unit}</td>
                      <td className="p-4 text-slate-500">{drug.manufacturer}</td>
                      <td className="p-4 text-orange-600">¥{drug.price.toFixed(2)}</td>
                      <td className="p-4"><span className={`font-bold ${drug.stock < drug.minStock ? 'text-red-500' : 'text-slate-700'}`}>{drug.stock}</span></td>
                      <td className="p-4"><span className={`text-xs px-2 py-1 rounded-full ${drug.uiStatus === 'expired' ? 'bg-red-100 text-red-600' : drug.uiStatus === 'low_stock' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{drug.uiStatus === 'expired' ? '过期' : drug.uiStatus === 'low_stock' ? '缺货' : '正常'}</span></td>
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
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-4"><div className="p-3 bg-red-100 rounded-lg text-red-600"><AlertTriangle/></div><div><div className="text-2xl font-bold text-red-700">{drugs.filter(d=>getExpiryStatus(d.expiryDate).days<0).length}</div><div className="text-xs text-red-500">已过期品种</div></div></div>
              <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-center gap-4"><div className="p-3 bg-orange-100 rounded-lg text-orange-600"><Clock/></div><div><div className="text-2xl font-bold text-orange-700">{drugs.filter(d=>{const x=getExpiryStatus(d.expiryDate).days; return x>=0 && x<30}).length}</div><div className="text-xs text-orange-500">30天内过期</div></div></div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b font-bold text-slate-700 flex items-center gap-2"><Filter size={18}/> 效期监控明细</div>
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 sticky top-0"><tr><th className="p-4">药品名称</th><th className="p-4">批号</th><th className="p-4">有效期至</th><th className="p-4">剩余天数</th><th className="p-4">预警状态</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {drugs.map(d => ({ ...d, ...getExpiryStatus(d.expiryDate) })).sort((a,b) => a.days - b.days).map(drug => (
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