// src/pages/NurseStation/index.tsx
import React, { useState, useEffect } from 'react';
import { ClipboardList, Search, Plus, Activity, CreditCard, Phone, CheckCircle, ShieldCheck } from 'lucide-react';
import { useStore } from '../../store/store';
import { registrationApi } from '../../services/api';
import type { RegistrationVO } from '../../types';

const NurseStation: React.FC = () => {
  const { doctors, departments, user } = useStore();
  
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<RegistrationVO[]>([]);
  const [receipt, setReceipt] = useState<RegistrationVO | null>(null);
  
  // 固定的医生 ID（UI 中不可更改）
  const FIXED_DOCTOR_ID = '1';
  // Calculate initial doctor
  const initialDeptId = 1;
  const initialActiveDoctors = doctors.filter(d => d.deptId === initialDeptId && d.isWorking);
  const initialDoctorId = FIXED_DOCTOR_ID || (initialActiveDoctors.length > 0 ? String(initialActiveDoctors[0].id) : '');
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '', gender: '1', age: '', idCard: '', phone: '',
    insurance: '自费', type: '初诊', deptId: initialDeptId, doctorId: initialDoctorId
  });

  // 1. 根据科室筛选医生
  const activeDoctors = doctors.filter(d => d.deptId === Number(formData.deptId) && d.isWorking);

  useEffect(() => {
    // 加载今日列表
    registrationApi.getList().then(setPatients);
  }, []);

  // 3. 身份证自动识别 (模拟)
  const handleIdBlur = async () => {
    if (formData.idCard.length >= 15) {
      const oldPatient = await registrationApi.checkPatient(formData.idCard);
      if (oldPatient) {
        alert(`识别到老患者：${oldPatient.name}`);
        setFormData(prev => ({
          ...prev,
          name: oldPatient.name,
          gender: String(oldPatient.gender),
          age: String(oldPatient.age),
          phone: oldPatient.phone,
          insurance: oldPatient.insuranceType,
          type: '复诊'
        }));
      }
    }
  };

  // 4. 提交挂号
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.idCard || !formData.phone || !formData.doctorId) {
      alert('请补全患者信息 (姓名、身份证、手机号、医生)');
      return;
    }

    setLoading(true);
    
    // 构造数据
    const payload = {
      patientName: formData.name,
      idCard: formData.idCard,
      gender: Number(formData.gender),
      age: Number(formData.age),
      phone: formData.phone,
      deptId: Number(formData.deptId),
      doctorId: Number(formData.doctorId),
      regFee: 20, 
      insuranceType: formData.insurance,
      type: formData.type
    };

    // 调试：打印发送到后端的 payload，确认字段（含 doctorId）已包含
    console.log('register payload:', payload);

    const res = await registrationApi.create(payload);
    setLoading(false);

    if (res.success && res.data) {
      // 不再使用浏览器 alert 弹窗，改为显示页面小卡片
      setPatients([res.data, ...patients]); // 更新列表
      setReceipt(res.data);
      // 重置表单，但保留科室选择
      setFormData(prev => ({ ...prev, name: '', age: '', idCard: '', phone: '' })); 
    } else {
      alert('挂号失败: ' + res.message);
    }
  };

  return (
    <>
    <div className="flex h-full gap-4 p-4 bg-slate-50 overflow-hidden">
      {/* --- 左侧：挂号表单 --- */}
      <div className="w-[420px] bg-white rounded-xl shadow-sm flex flex-col border border-slate-200">
        <div className="p-5 border-b bg-gradient-to-r from-teal-50 to-white flex items-center gap-3">
          <div className="p-2 bg-teal-100 text-teal-600 rounded-lg"><Plus size={20} /></div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">挂号建档</h2>
            <p className="text-xs text-slate-400">操作员: {user?.name}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form onSubmit={handleRegister} className="space-y-5">
            {/* 1. 身份识别 */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="w-1 h-4 bg-teal-500 rounded"></span> 身份信息
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-3 text-slate-400" size={18} />
                <input 
                  className="w-full pl-10 p-2.5 border rounded-lg text-sm bg-slate-50 focus:border-teal-500 outline-none font-mono"
                  placeholder="扫描或输入身份证号"
                  value={formData.idCard}
                  onChange={e => setFormData({...formData, idCard: e.target.value})}
                  onBlur={handleIdBlur} // 失去焦点时查询老患者
                />
              </div>
            </div>

            {/* 2. 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <input className="col-span-2 p-2.5 border rounded-lg text-sm" placeholder="患者姓名" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <select className="p-2.5 border rounded-lg text-sm bg-white" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                <option value="1">男</option>
                <option value="0">女</option>
              </select>
              <div className="relative">
                <input type="number" className="w-full p-2.5 border rounded-lg text-sm" placeholder="年龄" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">岁</span>
              </div>
              <div className="col-span-2 relative">
                <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                <input className="w-full pl-10 p-2.5 border rounded-lg text-sm" placeholder="手机号码" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div className="col-span-2 relative">
                <ShieldCheck className="absolute left-3 top-3 text-slate-400" size={18} />
                <select className="w-full pl-10 p-2.5 border rounded-lg text-sm bg-white" value={formData.insurance} onChange={e => setFormData({...formData, insurance: e.target.value})}>
                  <option value="自费">自费</option>
                  <option value="职工医保">职工医保</option>
                  <option value="居民医保">居民医保</option>
                </select>
              </div>
            </div>

            <div className="border-t border-dashed my-2"></div>

            {/* 3. 挂号选项 */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span> 挂号信息
              </label>
              
              {/* 科室选择 */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {departments.map(dept => (
                  <button 
                    key={dept.id} 
                    type="button"
                    onClick={() => {
                          const newDeptId = dept.id;
                          // 固定医生时不改变 doctorId，只改变科室选择
                          setFormData(prev => ({ ...prev, deptId: newDeptId }));
                        }}
                    className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap transition-colors ${Number(formData.deptId) === dept.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
              
              {/* 医生选择 */}
              <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                {activeDoctors.length > 0 ? (
                  activeDoctors.map(doc => (
                  <div 
                    key={doc.id}
                    // 如果固定医生，则禁用点击
                    onClick={FIXED_DOCTOR_ID ? undefined : () => setFormData({...formData, doctorId: String(doc.id)})}
                    className={`p-3 border rounded-xl ${FIXED_DOCTOR_ID ? 'cursor-not-allowed' : 'cursor-pointer'} flex justify-between items-center transition-all ${String(formData.doctorId) === String(doc.id) ? 'bg-teal-50 border-teal-500 shadow-sm' : 'bg-white border-slate-200 hover:border-teal-300'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${String(formData.doctorId) === String(doc.id) ? 'bg-teal-200 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
                        {doc.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-700">{doc.name}</div>
                        <div className="text-xs text-slate-500">{doc.title}</div>
                      </div>
                    </div>
                    {String(formData.doctorId) === String(doc.id) && <CheckCircle size={18} className="text-teal-600" />}
                  </div>
                ))) : (
                  <div className="text-center text-xs text-slate-400 py-4">该科室今日无医生排班</div>
                )}
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className={`w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex justify-center items-center gap-2 mt-4 shadow-lg shadow-teal-200 transition-all ${loading ? 'opacity-70' : 'active:scale-[0.98]'}`}
            >
              {loading ? '提交中...' : <><ClipboardList size={20}/> 确认挂号</>}
            </button>
          </form>
        </div>
      </div>

      {/* --- 右侧：列表 --- */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2 font-bold text-slate-700 text-lg">
            <Activity className="text-blue-500" size={24} />
            今日挂号列表
          </div>
          <div className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold">Total: {patients.length}</div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 z-10">
              <tr>
                <th className="p-4 pl-6">排队号</th>
                <th className="p-4">患者信息</th>
                <th className="p-4">医保类型</th>
                <th className="p-4">挂号科室</th>
                <th className="p-4">医生</th>
                <th className="p-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {patients.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 pl-6">
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{p.sequence}号</span>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{p.patientName}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{p.gender === 1 ? '男' : '女'} | {p.age}岁</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs border ${p.insuranceType === '自费' ? 'border-slate-200 text-slate-500' : 'border-blue-200 bg-blue-50 text-blue-600'}`}>
                      {p.insuranceType}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{p.deptName}</td>
                  <td className="p-4 text-slate-600">{doctors.find(d => d.id === p.doctorId)?.name || p.doctorName}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                      {p.statusDesc}
                    </span>
                  </td>
                </tr>
              ))}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-slate-400">
                    <div className="flex flex-col items-center">
                      <Search size={40} className="mb-2 opacity-20" />
                      暂无今日记录
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    {receipt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setReceipt(null)}></div>
        <div className="relative w-full max-w-sm bg-white p-6 rounded-lg shadow-xl z-10">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="text-base font-bold text-slate-800">挂号成功</div>
              <div className="text-xs text-slate-500">请凭小卡前往就诊</div>
            </div>
            <button onClick={() => setReceipt(null)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          <div className="text-sm text-slate-700 space-y-1">
            <div><span className="font-medium">挂号单号：</span>{receipt!.regNo}</div>
            <div><span className="font-medium">患者：</span>{receipt!.patientName}</div>
            <div><span className="font-medium">科室：</span>{receipt!.deptName}</div>
            <div><span className="font-medium">医生：</span>{receipt!.doctorName}</div>
            <div><span className="font-medium">排队号：</span>{receipt!.queueNo ?? receipt!.sequence}</div>
            <div><span className="font-medium">就诊日期：</span>{receipt!.visitDate ?? receipt!.createTime ?? receipt!.createdAt}</div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                const html = `<!doctype html><html><head><meta charset="utf-8"><title>挂号单</title></head><body><div style="font-family:Helvetica,Arial,sans-serif;padding:20px;max-width:400px;border:1px solid #e5e7eb;border-radius:6px;"><h3>挂号单</h3><p>挂号单号：${receipt!.regNo}</p><p>患者：${receipt!.patientName}</p><p>科室：${receipt!.deptName}</p><p>医生：${receipt!.doctorName}</p><p>排队号：${receipt!.queueNo ?? receipt!.sequence}</p><p>就诊日期：${receipt!.visitDate ?? receipt!.createdAt}</p></div></body></html>`;
                const w = window.open('about:blank', '_blank');
                if (w) {
                  w.document.write(html);
                  w.document.close();
                  w.focus();
                  w.print();
                }
              }}
              className="flex-1 py-2 text-sm bg-teal-600 text-white rounded-lg"
            >打印小卡</button>
            <button onClick={() => setReceipt(null)} className="flex-1 py-2 text-sm border rounded-lg">关闭</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default NurseStation;
