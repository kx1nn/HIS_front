import React, { useState, useEffect } from 'react';
import type { AxiosError, AxiosResponse } from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
  User, Clock, FileText, Pill, Plus, Search, 
  Trash2, Send, Activity, Stethoscope, LogOut
} from 'lucide-react';
import { useStore } from '../../store/store';
import { registrationApi, isCanceledError, pharmacyApi, doctorApi, chargeApi } from '../../services/api';
import * as logger from '../../services/logger';
import type { RegistrationVO, MedicalRecordVO, MedicineVO, PatientDetailVO, MedicalRecordDTO, PrescriptionVO } from '../../types';
import { RegistrationStatus } from '../../types';
import { debounce } from '../../utils/debounce';

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

/**
 * 医生工作台组件
 * 支持：候诊列表、接诊、病历查看与开立医嘱
 */
const DoctorStation: React.FC = () => {
  const { user, notify, logout } = useStore();
  const navigate = useNavigate();
  
  // --- 状态管理 ---
  const [patients, setPatients] = useState<RegistrationVO[]>([]);
  const [activePatientId, setActivePatientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  
  // 病历表单
  const [medicalRecord, setMedicalRecord] = useState<Partial<MedicalRecordDTO>>({
    chiefComplaint: '',
    presentIllness: '',
    diagnosis: '',
    doctorAdvice: '',
    pastHistory: '',
    personalHistory: '',
    familyHistory: '',
    physicalExam: ''
  });

  const [patientDetail, setPatientDetail] = useState<PatientDetailVO | null>(null);
  const [drugSearchResults, setDrugSearchResults] = useState<MedicineVO[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  // 本地叫号状态（仅本地高亮，未同步后端）
  const [calledPatientId, setCalledPatientId] = useState<number | null>(null);

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
  const [searchInput, setSearchInput] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loadingMedicines, setLoadingMedicines] = useState(false);

  // 状态更新控件（用于医生手动修改挂号状态）
  const [statusToSet, setStatusToSet] = useState<number>(RegistrationStatus.COMPLETED); // 默认改为【已就诊】(1)
  const statusOptions = [
    { value: RegistrationStatus.WAITING, label: '待就诊' },
    { value: RegistrationStatus.COMPLETED, label: '已就诊' },
    { value: RegistrationStatus.CANCELLED ?? 2, label: '已取消' },
    { value: 3, label: '已退号' },
    { value: RegistrationStatus.IN_CONSULTATION, label: '诊中' }
  ];

  // 当前接诊患者
  const activePatient = patients.find(p => p.id === activePatientId);

  // --- 初始化加载 ---
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fetchPatients = async () => {
      try {
        // 后端现在从 JWT 中解析当前医生信息并返回对应候诊列表，前端无需传入 doctorId
        logger.debug('DoctorStation.getWaitingList showAll:', showAll, 'user:', user);
        const list = await doctorApi.getWaitingList(showAll, { signal: controller.signal });
        if (!mounted) return;
        // 仅保留待就诊/候诊，并按排队号或 sequence 做升序展示
        const filtered = list.filter(p => p.status !== 2);
        const sorted = filtered.sort((a, b) => {
          // 若均有 queueNo，先比较字母前缀，再比较数字后缀
          const qA = a.queueNo || (a.sequence ? String(a.sequence) : '');
          const qB = b.queueNo || (b.sequence ? String(b.sequence) : '');
          const extract = (s: string) => {
            const m = /^([A-Za-z]*)(\d*)$/.exec(s) || ['', s, ''];
            return { prefix: m[1] || '', num: parseInt(m[2] || '0', 10) || 0 };
          };
          const eA = extract(String(qA));
          const eB = extract(String(qB));
          if (eA.prefix === eB.prefix) return eA.num - eB.num;
          return eA.prefix.localeCompare(eB.prefix);
        });
        setPatients(sorted);
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

  // 切换患者时，加载详情和草稿
  useEffect(() => {
    if (activePatientId) {
      setPatientDetail(null);
      setPrescriptions([]);
      
      // 1. 获取患者详情（带异常处理，处理 401/403）
      (async () => {
        try {
          // 从挂号记录中获取 patientId
          const reg = patients.find(p => p.id === activePatientId);
          const patientIdToFetch = reg?.patientId ?? activePatientId;
          
          const detail = await doctorApi.getPatientDetail(patientIdToFetch);
          setPatientDetail(detail);
        } catch (err: unknown) {
          const e = err as AxiosError | undefined;
          const status = e?.response?.status;
          if (status === 401) {
            notify('会话失效或无权访问患者信息，请重新登录', 'error');
            useStore.getState().logout();
          } else if (status === 403) {
            notify('访问被拒绝：请先登录并确保具有相应权限。', 'error');
          } else {
            notify('获取患者详情失败', 'error');
            logger.error('[DoctorStation] getPatientDetail failed', err);
          }
        }
      })();

      // 2. 获取病历草稿
      const reg = patients.find(p => p.id === activePatientId);
      if (reg) {
        doctorApi.getMedicalRecordByRegistrationId(reg.id).then(record => {
          if (record) {
            setMedicalRecord({
              chiefComplaint: record.chiefComplaint || '',
              presentIllness: record.presentIllness || '',
              diagnosis: record.diagnosis || '',
              doctorAdvice: record.doctorAdvice || '',
              pastHistory: record.pastHistory || '',
              personalHistory: record.personalHistory || '',
              familyHistory: record.familyHistory || '',
              physicalExam: record.physicalExam || ''
            });
          } else {
            setMedicalRecord({
              chiefComplaint: '', presentIllness: '', diagnosis: '', doctorAdvice: '',
              pastHistory: '', personalHistory: '', familyHistory: '', physicalExam: ''
            });
          }
        });
      }
    }
  }, [activePatientId, patients, notify]);

  // 打开药品搜索时，自动加载所有药品
  useEffect(() => {
    if (showDrugSearch) {
      void handleDrugSearch('');
    } else {
      // 关闭时清空搜索词和结果
      setSearchTerm('');
      setDrugSearchResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDrugSearch]);

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

  // 1. 叫号（仅本地提示，状态不变）
  const handleAnnouncePatient = (patient: RegistrationVO) => {
    setCalledPatientId(patient.id);
    notify(`正在呼叫 ${patient.queueNo || patient.sequence}号 ${patient.patientName} 到诊室...`, 'info');
  };

  // 2. 点击 "开始就诊" 真正开始接诊（设置状态并加载患者信息）
  const handleStartConsultation = async (patient: RegistrationVO) => {
    setActivePatientId(patient.id);
    // 立即更新前端为诊中（乐观更新）
    setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, status: RegistrationStatus.IN_CONSULTATION, statusDesc: '诊中' } : p));
    setCalledPatientId(null);
    notify(`开始就诊：${patient.patientName}`, 'info');

    try {
      await doctorApi.updateRegistrationStatus(patient.id, RegistrationStatus.IN_CONSULTATION);
      logger.debug('[DoctorStation] 患者状态已更新为就诊中:', patient.id);
    } catch (err) {
      logger.error('[DoctorStation] 更新患者状态失败:', err);
      notify('更新患者状态失败，请重试', 'error');
      // 回滚前端状态
      setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, status: RegistrationStatus.WAITING, statusDesc: '候诊' } : p));
      setActivePatientId(null);
    }
  };

  // 2. 药品搜索与添加
  const handleDrugSearch = React.useCallback(async (term: string) => {
    setSearchTerm(term);
    setLoadingMedicines(true);
    try {
      // 如果有搜索词，使用关键字搜索；否则加载所有药品
      const results = await pharmacyApi.searchMedicines(term.trim() || undefined);
      setDrugSearchResults(results);
    } catch (err) {
      logger.error('[DoctorStation] 药品搜索失败:', err);
      notify('加载药品列表失败', 'error');
    } finally {
      setLoadingMedicines(false);
    }
  }, [notify]);
  const debouncedDrugSearch = React.useMemo(() => debounce((t: string) => { void handleDrugSearch(t); }, 300), [handleDrugSearch]);

  const handleAddDrug = (drug: MedicineVO) => {
    // RX-02: 检查库存是否充足
    if (drug.stockQuantity <= 0) {
      notify(`药品【${drug.name}】库存不足，当前库存: ${drug.stockQuantity}`, 'error');
      return;
    }
    
    const existing = prescriptions.find(p => p.drugId === drug.mainId);
    if (existing) {
      // RX-02: 增加数量时也要检查库存
      const newCount = existing.count + 1;
      if (newCount > drug.stockQuantity) {
        notify(`药品【${drug.name}】库存不足，当前库存: ${drug.stockQuantity}`, 'error');
        return;
      }
      setPrescriptions(prev => prev.map(p => 
        p.drugId === drug.mainId ? { ...p, count: newCount } : p
      ));
    } else {
      // 将零售价格字符串转换为数值以便做计算
      const priceNum = parseFloat(drug.retailPrice || '0') || 0;
      setPrescriptions(prev => [...prev, {
        id: Date.now(),
        drugId: drug.mainId,
        name: drug.name,
        spec: drug.specification || '',
        price: priceNum,
        count: 1,
        usage: '每日3次, 每次1粒' // 默认用法
      }]);
    }
    setShowDrugSearch(false);
    setSearchTerm('');
    notify(`已添加: ${drug.name}`, 'success');
  };

  // RX-02: 处方列表中增加数量时验证库存
  const handleIncreaseCount = async (item: PrescriptionItem) => {
    try {
      const drugDetail = await pharmacyApi.getMedicineDetail(item.drugId);
      if (!drugDetail) {
        notify(`无法获取药品【${item.name}】信息`, 'error');
        return;
      }
      
      const newCount = item.count + 1;
      if (newCount > drugDetail.stockQuantity) {
        notify(`药品【${item.name}】库存不足，当前库存: ${drugDetail.stockQuantity}`, 'error');
        return;
      }
      
      setPrescriptions(prev => prev.map(p => 
        p.drugId === item.drugId ? {...p, count: newCount} : p
      ));
    } catch (err) {
      logger.error('DoctorStation.handleIncreaseCount', err);
      notify('库存查询失败，请重试', 'error');
    }
  };

  // 保存草稿
  const handleSaveDraft = async () => {
    if (!activePatient) return;
    setIsSaving(true);
    try {
      const dto: MedicalRecordDTO = {
        registrationId: activePatient.id,
        ...medicalRecord,
        status: 0 // Draft
      };
      await doctorApi.saveMedicalRecord(dto);
      // MR-01: 统一提示信息为"病历保存成功"
      notify('病历保存成功', 'success');
    } catch (err) {
      // MR-01: 增强错误提示，显示具体错误信息
      logger.error('DoctorStation.saveDraft', err);
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      notify(`病历保存失败: ${errorMsg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. 完成诊疗
  const handleSubmit = async () => {
    if (!activePatient) return;
    if (!medicalRecord.diagnosis) {
      notify('请填写初步诊断结果', 'warn');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!activePatient) return;
    setShowConfirmModal(false);
    setLoading(true);

    try {
      // 1. 保存并提交病历
      const dto: MedicalRecordDTO = {
        registrationId: activePatient.id,
        ...medicalRecord,
        status: 1 // Submitted
      };
      const savedRecord = await doctorApi.saveMedicalRecord(dto);
      if (savedRecord) {
        await doctorApi.submitMedicalRecord(savedRecord.mainId);
      }

      // 2. 发送处方
      if (prescriptions.length > 0) {
        // RX-02: 提交前验证所有药品库存
        for (const item of prescriptions) {
          try {
            const drugDetail = await pharmacyApi.getMedicineDetail(item.drugId);
            if (!drugDetail || drugDetail.stockQuantity < item.count) {
              notify(`药品【${item.name}】库存不足，当前库存: ${drugDetail?.stockQuantity ?? 0}`, 'error');
              setLoading(false);
              return;
            }
          } catch (err) {
            logger.error('DoctorStation.checkStock', err);
            notify(`无法验证药品【${item.name}】库存，请重试`, 'error');
            setLoading(false);
            return;
          }
        }
        
        const rx: PrescriptionVO = {
          id: 0,
          patientName: activePatient.patientName,
          gender: activePatient.gender,
          age: activePatient.age,
          regNo: activePatient.regNo,
          totalAmount: prescriptions.reduce((sum, item) => sum + (item.price * item.count), 0).toFixed(2),
          items: prescriptions.map(p => ({
            drugName: p.name,
            spec: p.spec,
            count: p.count,
            usage: p.usage,
            medicineId: p.drugId
          }))
        };
        const sentRx = await pharmacyApi.sendPrescription(rx);
        if (sentRx) {
          // RX-01: 单独提示处方开具成功并显示总金额
          notify(`处方开具成功，总金额：¥${rx.totalAmount}`, 'success');
          
          // 3. 生成收费单 (如果有处方)
          await chargeApi.create({
            registrationId: activePatient.id,
            prescriptionIds: [sentRx.id]
          });
        }
      } else {
        // 如果没有处方，也可能需要生成一个纯诊疗费的收费单（视业务需求而定）
        // 目前仅在有处方时生成
      }

      // 4. 更新挂号状态（完成）
      await doctorApi.updateRegistrationStatus(activePatient.id, RegistrationStatus.COMPLETED);

      // 5. 从候诊列表移除已就诊患者并刷新列表
      setPatients(prev => prev.filter(p => p.id !== activePatientId));
      setActivePatientId(null);
      
      // 重新获取候诊列表，确保数据同步
      try {
          const waitingList = await doctorApi.getWaitingList(showAll);
        setPatients(waitingList.filter((p: RegistrationVO) => 
          p.status === RegistrationStatus.WAITING || p.status === RegistrationStatus.IN_CONSULTATION
        ));
      } catch (err) {
        logger.error('[DoctorStation] refresh waiting list failed', err);
      }
      
      notify('诊疗完成！病历已归档，处方已发送至药房并生成收费单。', 'success');
    } catch (e) {
      logger.error('DoctorStation.submit', e);
      notify('操作失败，请重试', 'error');
    } finally {
      setLoading(false);
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
                onMouseDown={(e) => e.preventDefault()} // 防止文本被选中并出现光标闪烁
                onClick={() => activePatientId !== p.id && void handleAnnouncePatient(p)}
                onContextMenu={(e) => handleViewHistory(e, p)}
                className={`p-4 border-b cursor-pointer transition-all hover:bg-slate-50 group relative select-none ${
                  activePatientId === p.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-700">
                    <span className="text-lg mr-1 font-mono">{p.queueNo || p.sequence}</span>{p.queueNo ? '' : '号'} {p.patientName}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    p.status === RegistrationStatus.IN_CONSULTATION ? 'bg-green-50 text-green-600 border-green-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'
                  }`}>
                    {p.status === RegistrationStatus.IN_CONSULTATION ? '诊中' : '候诊'}
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex justify-between items-center">
                  <span>{p.genderDesc || (p.gender === 1 ? '男' : p.gender === 2 ? '女' : '—')} · {p.age}岁</span>
                  <span className="font-mono text-slate-400">{(p.createTime || '').slice(0,10)}</span>
                </div>
                {/* DC-01: 显示病历号 */}
                {p.mrn && (
                  <div className="text-xs text-blue-600 font-mono mt-1">
                    病历号: {p.mrn}
                  </div>
                )}
                
                {/* 悬停显示的叫号按钮 */}
                <div className="absolute right-2 bottom-2 flex gap-2">
                <button onClick={() => void handleAnnouncePatient(p)} className="bg-blue-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                  <Activity size={12}/> 叫号
                </button>
                {calledPatientId === p.id && activePatientId !== p.id && (
                  <button onClick={() => void handleStartConsultation(p)} className="bg-green-600 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-sm">
                    开始就诊
                  </button>
                )}
              </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* === 中间：病历书写 (50%) === */}
      <div className="flex-1 flex flex-col bg-white border-r border-slate-200 relative z-0">
        {activePatient ? (
          <div className="flex-1 flex bg-white border-r border-slate-200 relative z-0">
              <div className="w-72 border-r bg-slate-50 p-6 overflow-y-auto">
                <div className="flex items-center gap-4 mb-4 select-none">
                  <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    {activePatient.patientName[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-slate-800 select-none">{activePatient.patientName}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 select-none">
                        {activePatient.insuranceType}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                      <span>{activePatient.genderDesc || (activePatient.gender === 1 ? '男' : activePatient.gender === 2 ? '女' : '—')} · {activePatient.age}岁</span>
                      <span className="w-px h-3 bg-slate-300"></span>
                      <span className="font-mono">MRN: {activePatient.mrn}</span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-700 space-y-3">
                  {patientDetail?.name && (
                    <div>
                      <div className="text-xs text-slate-400">姓名</div>
                      <div>{patientDetail.name}</div>
                    </div>
                  )}
                  {patientDetail?.patientNo && (
                    <div>
                      <div className="text-xs text-slate-400">患者号</div>
                      <div className="font-mono">{patientDetail.patientNo}</div>
                    </div>
                  )}
                  {patientDetail?.genderDesc && (
                    <div>
                      <div className="text-xs text-slate-400">性别</div>
                      <div>{patientDetail.genderDesc}</div>
                    </div>
                  )}
                  {patientDetail?.age !== undefined && (
                    <div>
                      <div className="text-xs text-slate-400">年龄</div>
                      <div>{patientDetail.age}岁</div>
                    </div>
                  )}
                  {patientDetail?.phone && (
                    <div>
                      <div className="text-xs text-slate-400">手机号</div>
                      <div>{patientDetail.phone}</div>
                    </div>
                  )}
                  {patientDetail?.idCard && (
                    <div>
                      <div className="text-xs text-slate-400">身份证号</div>
                      <div className="font-mono">{patientDetail.idCard}</div>
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-400 mt-4">{activePatient.type || '普通门诊'}</div>
              </div>

              <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-slate-50/30">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center border-b pb-2 mb-4">
                      <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <FileText size={18} className="text-blue-500"/> 
                        病历文书
                      </h3>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={String(statusToSet)}
                          onChange={e => setStatusToSet(Number(e.target.value))}
                          className="text-xs p-1 border rounded-md bg-white"
                          disabled={!activePatient}
                        >
                          {statusOptions.map(opt => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={async () => {
                            if (!activePatient) return;
                            const s = statusToSet;
                            const ok = await doctorApi.updateRegistrationStatus(activePatient.id, s);
                            if (ok) {
                              setPatients(prev => prev.map(p => p.id === activePatient.id ? { ...p, status: s, statusDesc: statusOptions.find(o => o.value === s)?.label || String(s) } : p));
                              notify('状态更新成功', 'success');
                            } else {
                              notify('状态更新失败，请重试', 'error');
                            }
                          }}
                          disabled={!activePatient}
                          className={`text-xs px-3 py-1 rounded ${activePatient ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                        >
                          更新状态
                        </button>
                      </div>

                      <button 
                        onClick={handleSaveDraft} 
                        disabled={isSaving || loading}
                        className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? '保存中...' : '保存草稿'}
                      </button>
                    </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">主诉 (Chief Complaint)</label>
                        <textarea 
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                          rows={2}
                          placeholder="患者主要不适症状..."
                          value={medicalRecord.chiefComplaint || ''}
                          onChange={e => setMedicalRecord({...medicalRecord, chiefComplaint: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">现病史 (HPI)</label>
                        <textarea 
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                          rows={4}
                          placeholder="起病情况、主要症状特点、病情发展..."
                          value={medicalRecord.presentIllness || ''}
                          onChange={e => setMedicalRecord({...medicalRecord, presentIllness: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1.5">体格检查 (Physical Exam)</label>
                        <textarea 
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                          rows={3}
                          placeholder="体格检查描述..."
                          value={medicalRecord.physicalExam || ''}
                          onChange={e => setMedicalRecord({...medicalRecord, physicalExam: e.target.value})}
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

            </div>
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
                  value={searchInput}
                  onChange={e => { setSearchInput(e.target.value); debouncedDrugSearch(e.target.value); }}
                />
                <button onClick={() => setShowDrugSearch(false)} className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600">关闭</button>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100%-60px)] custom-scrollbar">
                {loadingMedicines ? (
                  <div className="text-center text-slate-400 py-8">
                    <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mb-2"/>
                    <div className="text-sm">正在加载药品列表...</div>
                  </div>
                ) : (
                  <>
                    {drugSearchResults.map(drug => (
                      <div 
                        key={drug.mainId} 
                        onClick={() => handleAddDrug(drug)}
                        className="p-3 border border-slate-100 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                      >
                        <div className="flex justify-between">
                          <span className="font-bold text-slate-700 text-sm">{drug.name}</span>
                          <span className="text-orange-600 font-medium text-sm">¥{drug.retailPrice}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 flex justify-between">
                          <span>{drug.specification}</span>
                          <span className="group-hover:text-blue-600">库存: {drug.stockQuantity}</span>
                        </div>
                      </div>
                    ))}
                    {!loadingMedicines && drugSearchResults.length === 0 && (
                      <div className="text-center text-slate-400 py-4 text-sm">
                        {searchTerm ? '未找到相关药品' : '暂无药品数据'}
                      </div>
                    )}
                  </>
                )}
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
                        onClick={() => handleIncreaseCount(item)}
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
                      <span className="text-sm text-slate-500 font-mono">{historyModal.selectedRecord?.visitTime || ''}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-slate-500">就诊科室:</span> <span className="font-medium">--</span></div>
                      <div><span className="text-slate-500">接诊医生:</span> <span className="font-medium">{historyModal.selectedRecord?.doctorName || '--'}</span></div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">主诉</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord?.chiefComplaint || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">现病史</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord?.presentIllness || '无'}</p>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">诊断</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg font-bold">{historyModal.selectedRecord?.diagnosis || '无'}</p>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-700 mb-1 text-sm">医嘱</h4>
                        <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{historyModal.selectedRecord?.doctorAdvice || '无'}</p>
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
                  <span className="font-medium text-slate-800">{activePatient?.patientName}</span>
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