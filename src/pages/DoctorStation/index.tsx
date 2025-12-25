import React, { useState, useEffect } from 'react';
import type { AxiosError, AxiosResponse } from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  User, Clock, FileText, Pill, Plus, Search, 
  Trash2, Send, Activity, Stethoscope, LogOut
} from 'lucide-react';
import { useStore } from '../../store/store';
import { registrationApi, isCanceledError } from '../../services/api';
import * as logger from '../../services/logger';
import type { RegistrationVO, Drug, MedicalRecordVO } from '../../types';

// 药品数据由后端提供；前端初始为空
const DRUGS: Drug[] = [];

// 处方项类型
interface PrescriptionItem {
  id: number;
  drugId: number;
  name: string;
  spec: string;
  price: number;
  count: number;
  usage: string;
}

const DoctorStation: React.FC = () => {
  const { user, notify, logout } = useStore();
  const navigate = useNavigate();
  
  // --- 状态管理 ---
  const [patients, setPatients] = useState<RegistrationVO[]>([]);
  const [activePatientId, setActivePatientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  // 病历表单
  const [medicalRecord, setMedicalRecord] = useState({
    symptom: '',   // 主诉
    history: '',   // 现病史
    diagnosis: '',  // 初步诊断
    doctorAdvice: '' // 医嘱
  });

  // 历史病历弹窗
  const [historyModal, setHistoryModal] = useState<{
    visible: boolean;
    patientId: number | null;
    patientName: string;
    records: MedicalRecordVO[];
    loading: boolean;
    selectedRecord: MedicalRecordVO | null;
  }>({
    visible: false,
    patientId: null,
    patientName: '',
    records: [],
    loading: false,
    selectedRecord: null
  });

  // 处方管理
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [showDrugSearch, setShowDrugSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 当前接诊患者
  const activePatient = patients.find(p => p.id === activePatientId);

  // --- 初始化加载 ---
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fetchPatients = async () => {
      try {
        const apiModule = await import('../../services/api');
        // 后端现在从 JWT 中解析当前医生信息并返回对应候诊列表，前端无需传入 doctorId
        logger.debug('DoctorStation.getWaitingList showAll:', showAll, 'user:', user);
        const list = await apiModule.doctorApi.getWaitingList(showAll, { signal: controller.signal });
        if (!mounted) return;
        setPatients(list.filter(p => p.status !== 2));
      } catch (err: unknown) {
        // 若为取消请求则静默返回
        if (isCanceledError(err)) return;
        const e = err as AxiosError | undefined;
        // 认证失败（401 或后端 body 指示认证失败）时，显示提示但不立即跳走
        const resp = e?.response as AxiosResponse | undefined;
        const respData = resp?.data as unknown as Record<string, unknown> | undefined;
        const msg = respData ? String(respData['message'] ?? '') : '';
        if (resp?.status === 401 || msg.includes('认证')) {
          useStore.getState().notify('会话失效或无权访问候诊列表，请重新登录', 'error');
          useStore.getState().logout();
          // 不直接 navigate 跳走，保留提示让用户手动或点击登录
          return;
        }

        // 回退到通用挂号列表（若后端不支持 doctor/waiting-list）
        try {
          const list = await registrationApi.getList(undefined, { signal: controller.signal });
          if (!mounted) return;
          setPatients(list.filter(p => p.status !== 2));
        } catch (e2) {
          if (isCanceledError(e2)) return;
          logger.error('DoctorStation.fetchPatients', e2);
        }
      }
    };

    void fetchPatients();
    return () => { mounted = false; controller.abort(); };
  }, [showAll, user?.relatedId, user?.userId, user?.role, user, navigate]);

  // 切换患者时，重置表单
  useEffect(() => {
    if (activePatientId) {
      // 实际项目中这里应该调用接口获取该患者的历史病历
      setMedicalRecord({ symptom: '', history: '', diagnosis: '', doctorAdvice: '' });
      setPrescriptions([]);
    }
  }, [activePatientId]);

  // loadPatients 移入 effect 内，避免缺失依赖警告

  // --- 业务逻辑 ---

  // 查看历史病历
  const handleViewHistory = async (e: React.MouseEvent, patient: RegistrationVO) => {
    e.preventDefault(); // 阻止默认右键菜单
    setHistoryModal({
      visible: true,
      patientId: patient.patientId || null,
      patientName: patient.patientName,
      records: [],
      loading: true,
      selectedRecord: null
    });
    
    if (patient.patientId) {
      try {
        const { doctorApi } = await import('../../services/api');
        const list = await doctorApi.getPatientHistory(patient.patientId);
        setHistoryModal(prev => ({ ...prev, records: list, loading: false }));
      } catch {
        notify('获取历史病历失败', 'error');
        setHistoryModal(prev => ({ ...prev, loading: false }));
      }
    } else {
      setHistoryModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleCloseHistory = () => {
    setHistoryModal(prev => ({ ...prev, visible: false, selectedRecord: null }));
  };

  const handleSelectHistoryRecord = async (record: MedicalRecordVO) => {
    // 如果已经有详情数据则直接显示，否则调用详情接口
    if (record.doctorAdvice) {
       setHistoryModal(prev => ({ ...prev, selectedRecord: record }));
       return;
    }
    
    try {
      const { doctorApi } = await import('../../services/api');
      const detail = await doctorApi.getMedicalRecordDetail(record.mainId);
      if (detail) {
        setHistoryModal(prev => ({ ...prev, selectedRecord: detail }));
      } else {
        setHistoryModal(prev => ({ ...prev, selectedRecord: record })); // Fallback
      }
    } catch {
      notify('获取病历详情失败', 'error');
    }
  };

  // 1. 叫号/接诊
  const handleCallPatient = (patient: RegistrationVO) => {
    setActivePatientId(patient.id);
    // 更新状态为"诊中"
    setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, status: 1, statusDesc: '诊中' } : p));
    notify(`正在呼叫 ${patient.sequence}号 ${patient.patientName} 到诊室...`, 'info');
  };

  // 2. 添加药品
  const handleAddDrug = (drug: Drug) => {
    const existing = prescriptions.find(p => p.drugId === drug.id);
    if (existing) {
      setPrescriptions(prev => prev.map(p => 
        p.drugId === drug.id ? { ...p, count: p.count + 1 } : p
      ));
    } else {
      setPrescriptions(prev => [...prev, {
        id: Date.now(),
        drugId: drug.id,
        name: drug.name,
        spec: drug.spec,
        price: drug.price,
        count: 1,
        usage: '每日3次, 每次1粒' // 默认用法
      }]);
    }
    setShowDrugSearch(false);
    setSearchTerm('');
  };

  // 3. 完成诊疗
  const handleSubmit = async () => {
    if (!activePatient) return;
    if (!medicalRecord.diagnosis) {
      notify('请填写初步诊断结果', 'warn');
      return;
    }

    // 使用自定义卡片式确认框代替原生 confirm
    // 这里我们简单实现一个状态来控制确认弹窗的显示
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!activePatient) return;
    setShowConfirmModal(false);
    setLoading(true);
    // 调用后端更新状态
    const { doctorApi } = await import('../../services/api');
    const ok = await doctorApi.updateRegistrationStatus(activePatient.id, 1);
    setLoading(false);
    if (ok) {
      setPatients(prev => prev.filter(p => p.id !== activePatientId));
      setActivePatientId(null);
      notify('诊疗完成！病历已归档，处方已发送至药房。', 'success');
    } else {
      notify('操作失败，请重试', 'error');
    }
  };

  // 计算总金额
  const totalAmount = prescriptions.reduce((sum, item) => sum + (item.price * item.count), 0);

  return (
    <div className="flex h-full bg-slate-100 overflow-hidden">
      
      {/* === 左侧：候诊列表 (20%) === */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-10 shadow-sm">
        <div className="p-4 border-b bg-slate-50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-700 flex items-center gap-2">
              <User size={18} className="text-blue-600"/> 
              候诊列表 
              <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full">{patients.length}</span>
            </h2>
            <div className="flex items-center gap-1">
              <div className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[11px] font-medium flex items-center gap-1">
                <User size={10} />
                {user?.name}
              </div>
              <button 
                onClick={() => { logout(); navigate('/login'); }}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                title="退出登录"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <select 
              value={showAll ? 'dept' : 'personal'} 
              onChange={(e) => setShowAll(e.target.value === 'dept')}
              className="w-full text-xs p-2 border rounded-md bg-white outline-none focus:border-blue-500"
            >
              <option value="personal">个人候诊队列</option>
              <option value="dept">全科室候诊队列</option>
            </select>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {patients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
              <Clock size={32} className="mb-2 opacity-20"/>
              暂无候诊患者
            </div>
          ) : (
            patients.map(p => (
              <div 
                key={p.id}
                onClick={() => activePatientId !== p.id && handleCallPatient(p)}
                onContextMenu={(e) => handleViewHistory(e, p)}
                className={`p-4 border-b cursor-pointer transition-all hover:bg-slate-50 group relative ${
                  activePatientId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-700">
                    <span className="text-lg mr-1 font-mono">{p.queueNo || p.sequence}</span>{p.queueNo ? '' : '号'} {p.patientName}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    p.status === 1 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'
                  }`}>
                    {p.status === 1 ? '诊中' : '候诊'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex justify-between items-center">
                  <span>{p.gender === 1 ? '男' : '女'} | {p.age}岁</span>
                  <span className="font-mono text-slate-400">{(p.createTime || '').slice(0,5)}</span>
                </div>
                
                {/* 悬停显示的叫号按钮 */}
                {activePatientId !== p.id && (
                  <button className="absolute right-2 bottom-2 bg-blue-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                    <Activity size={12}/> 叫号
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* === 中间：病历书写 (50%) === */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200 relative z-0">
        {activePatient ? (
          <>
            {/* 患者信息条 */}
            <div className="h-16 border-b flex items-center justify-between px-6 bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  {activePatient.patientName[0]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-slate-800">{activePatient.patientName}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                      {activePatient.insuranceType}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                    <span>{activePatient.gender === 1 ? '男' : '女'}</span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span>{activePatient.age}岁</span>
                    <span className="w-px h-3 bg-slate-300"></span>
                    <span className="font-mono">MRN: {activePatient.mrn}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wider">Visit Type</div>
                <div className="font-bold text-slate-700">{activePatient.type || '普通门诊'}</div>
              </div>
            </div>

            {/* 病历表单 */}
            <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/30">
              <div className="max-w-5xl mx-auto space-y-6">
                
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2">
                    <FileText size={18} className="text-blue-500"/> 
                    病历文书
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1.5">主诉 (Chief Complaint)</label>
                      <textarea 
                        className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                        rows={2}
                        placeholder="患者主要不适症状..."
                        value={medicalRecord.symptom}
                        onChange={e => setMedicalRecord({...medicalRecord, symptom: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1.5">现病史 (HPI)</label>
                      <textarea 
                        className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                        rows={4}
                        placeholder="起病情况、主要症状特点、病情发展..."
                        value={medicalRecord.history}
                        onChange={e => setMedicalRecord({...medicalRecord, history: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2 border-b pb-2">
                    <Stethoscope size={18} className="text-teal-500"/> 
                    诊断结果
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">初步诊断 <span className="text-red-500">*</span></label>
                    <input 
                      type="text"
                      className="w-full p-3 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
                      placeholder="输入诊断结果 (ICD-10)"
                      value={medicalRecord.diagnosis}
                      onChange={e => setMedicalRecord({...medicalRecord, diagnosis: e.target.value})}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['上呼吸道感染', '急性胃肠炎', '高血压病', '支气管炎'].map(tag => (
                        <button 
                          key={tag}
                          onClick={() => setMedicalRecord({...medicalRecord, diagnosis: tag})}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-full transition-colors"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">医嘱 (Doctor Advice)</label>
                    <textarea 
                      className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all resize-none"
                      rows={3}
                      placeholder="输入医嘱..."
                      value={medicalRecord.doctorAdvice}
                      onChange={e => setMedicalRecord({...medicalRecord, doctorAdvice: e.target.value})}
                    />
                  </div>
                </div>

              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Stethoscope size={40} className="text-slate-300"/>
            </div>
            <p className="text-lg font-medium text-slate-500">工作台就绪</p>
            <p className="text-sm">请从左侧列表呼叫患者开始诊疗</p>
          </div>
        )}
      </div>

      {/* === 右侧：处方开立 (30%) === */}
      <div className="w-96 bg-white flex flex-col z-10 shadow-sm border-l border-slate-200">
        <div className="p-4 border-b bg-slate-50 flex justify-between items-center shrink-0">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <Pill size={18} className="text-teal-600"/> 
            处方开立
          </h2>
          <button 
            disabled={!activePatient}
            onClick={() => setShowDrugSearch(!showDrugSearch)}
            className={`text-xs px-3 py-1.5 rounded border transition-all flex items-center gap-1 ${
              activePatient ? 'bg-white border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-600 shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Plus size={14}/> 添加药品
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative flex flex-col">
          {/* 药品搜索层 (悬浮) */}
          {showDrugSearch && (
            <div className="absolute top-0 left-0 w-full h-full bg-white/95 backdrop-blur-sm z-20 p-4 animate-in fade-in slide-in-from-top-2">
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-3 text-slate-400"/>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="搜索药品名称/拼音..." 
                  className="w-full pl-9 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-blue-500 outline-none"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <button onClick={() => setShowDrugSearch(false)} className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600">关闭</button>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100%-60px)] custom-scrollbar">
                {DRUGS.filter(d => d.name.includes(searchTerm)).map(drug => (
                  <div 
                    key={drug.id} 
                    onClick={() => handleAddDrug(drug)}
                    className="p-3 border border-slate-100 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-700 text-sm">{drug.name}</span>
                      <span className="text-orange-600 font-medium text-sm">¥{drug.price}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex justify-between">
                      <span>{drug.spec}</span>
                      <span className="group-hover:text-blue-600">库存: {drug.stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 处方列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {prescriptions.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                暂无处方明细
              </div>
            ) : (
              prescriptions.map((item, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-700 text-sm">{item.name}</span>
                    <button 
                      onClick={() => setPrescriptions(prev => prev.filter(p => p.drugId !== item.drugId))}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14}/>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{item.spec}</span>
                    <span className="text-orange-500">¥{(item.price * item.count).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded bg-slate-50">
                      <button 
                        onClick={() => setPrescriptions(prev => prev.map(p => p.drugId === item.drugId ? {...p, count: Math.max(1, p.count-1)} : p))}
                        className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 text-slate-500"
                      >-</button>
                      <span className="w-8 text-center text-xs font-mono">{item.count}</span>
                      <button 
                        onClick={() => setPrescriptions(prev => prev.map(p => p.drugId === item.drugId ? {...p, count: p.count+1} : p))}
                        className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 text-slate-500"
                      >+</button>
                    </div>
                    <input 
                      className="flex-1 text-xs border-b border-slate-200 bg-transparent py-1 px-1 focus:border-blue-500 outline-none text-slate-600"
                      value={item.usage}
                      onChange={(e) => setPrescriptions(prev => prev.map(p => p.drugId === item.drugId ? {...p, usage: e.target.value} : p))}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 底部结算区 */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 shrink-0">
            <div className="flex justify-between items-end mb-4">
              <span className="text-xs text-slate-500">处方金额合计</span>
              <span className="text-2xl font-bold text-red-500 font-mono">
                <span className="text-sm mr-1">¥</span>{totalAmount.toFixed(2)}
              </span>
            </div>
            <button 
              disabled={!activePatient || loading}
              onClick={handleSubmit}
              className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex justify-center items-center gap-2 transition-all ${
                !activePatient || loading ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 active:scale-[0.98]'
              }`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
              ) : (
                <> <Send size={18}/> 完成诊疗 </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* === 历史病历弹窗 === */}
      {historyModal.visible && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <FileText size={18} className="text-blue-600"/>
                {historyModal.patientName} - 历史病历
              </h3>
              <button onClick={handleCloseHistory} className="text-slate-400 hover:text-slate-600">
                <Plus size={20} className="rotate-45"/>
              </button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              {/* 左侧列表 */}
              <div className="w-1/3 border-r bg-slate-50 overflow-y-auto custom-scrollbar p-2">
                {historyModal.loading ? (
                  <div className="text-center py-10 text-slate-400">加载中...</div>
                ) : historyModal.records.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">暂无历史病历</div>
                ) : (
                  historyModal.records.map(rec => (
                    <div 
                      key={rec.mainId}
                      onClick={() => handleSelectHistoryRecord(rec)}
                      className={`p-3 mb-2 rounded-lg cursor-pointer border transition-all ${
                        historyModal.selectedRecord?.mainId === rec.mainId 
                          ? 'bg-white border-blue-500 shadow-sm' 
                          : 'bg-white border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-slate-700 text-sm">{rec.visitTime?.slice(0,10)}</span>
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{rec.doctorName}</span>
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1">诊断: {rec.diagnosis}</div>
                    </div>
                  ))
                )}
              </div>
              
              {/* 右侧详情 */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-white">
                {historyModal.selectedRecord ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h2 className="text-xl font-bold text-slate-800">门诊病历</h2>
                      <span className="text-sm text-slate-500 font-mono">{historyModal.selectedRecord.visitTime}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-slate-500">就诊科室:</span> <span className="font-medium">--</span></div>
                      <div><span className="text-slate-500">接诊医生:</span> <span className="font-medium">{historyModal.selectedRecord.doctorName}</span></div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">主诉</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord.chiefComplaint || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">现病史</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord.presentIllness || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">既往史</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord.pastHistory || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">诊断</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg font-bold">{historyModal.selectedRecord.diagnosis || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">医嘱</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord.doctorAdvice || '无'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                    请选择左侧病历查看详情
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === 诊疗完成确认弹窗 === */}
      {showConfirmModal && activePatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100">
            <div className="flex items-center gap-3 mb-4 text-blue-600">
              <div className="p-2 bg-blue-50 rounded-full">
                <Activity size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">确认完成诊疗？</h3>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg mb-6 border border-slate-100">
              <p className="text-sm text-slate-600 mb-2">即将提交以下信息：</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">患者姓名：</span>
                  <span className="font-medium text-slate-800">{activePatient.patientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">初步诊断：</span>
                  <span className="font-medium text-slate-800">{medicalRecord.diagnosis}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">处方金额：</span>
                  <span className="font-bold text-red-500">¥{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmSubmit}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
              >
                确认提交
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DoctorStation;