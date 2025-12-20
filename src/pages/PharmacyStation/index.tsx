import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, AlertTriangle, 
  CheckCircle, Filter, Activity, Clock 
} from 'lucide-react';
import { pharmacyApi, isCanceledError } from '../../services/api';
import { useStore } from '../../store/store';
import * as logger from '../../services/logger';
import type { Drug, PrescriptionVO, PrescriptionItemVO } from '../../types';

const PharmacyStation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'expiry' | 'dispense'>('dispense');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionVO[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fetch = async () => {
      if (!mounted) return;
      try {
        if (activeTab === 'inventory' || activeTab === 'expiry') {
          const data = await pharmacyApi.getDrugs(searchTerm, undefined, { signal: controller.signal });
          if (!mounted) return;
          setDrugs(data);
        } else {
          const data = await pharmacyApi.getPendingPrescriptions({ signal: controller.signal });
          if (!mounted) return;
          setPrescriptions(data);
        }
      } catch (e) {
        if (isCanceledError(e)) return;
        logger.warn('PharmacyStation.fetch', e);
      }
    };

    void fetch();
    return () => { mounted = false; controller.abort(); };
  }, [activeTab, searchTerm]);

  const handleDispense = async (id: number) => {
    if (confirm('确认完成发药？库存将自动扣减。')) {
      await pharmacyApi.dispense(id);
      // 重新加载待发药处方
      try {
        const data = await pharmacyApi.getPendingPrescriptions();
        setPrescriptions(data);
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
      <div className="bg-white border-b px-6 pt-4 flex gap-6 shadow-sm z-10">
        <button onClick={() => setActiveTab('dispense')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'dispense' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Activity size={18}/> 发药作业 {prescriptions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{prescriptions.length}</span>}</button>
        <button onClick={() => setActiveTab('inventory')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Package size={18}/> 药品信息</button>
        <button onClick={() => setActiveTab('expiry')} className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'expiry' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><AlertTriangle size={18}/> 效期预警</button>
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
                    setDrugs(data);
                  } catch {
                    // ignore
                  }
                }
              }}/></div>
              <button className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-teal-700"><Plus size={16}/> 新增药品</button>
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

export default PharmacyStation;