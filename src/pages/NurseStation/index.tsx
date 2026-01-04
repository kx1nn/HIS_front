// src/pages/NurseStation/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Plus, Activity, CreditCard, Phone, ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';
import { useStore } from '../../store/store';
import { basicApi, registrationApi, patientApi, logApiError, isCanceledError } from '../../services/api';
import * as logger from '../../services/logger';
import type { RawDoctor, RawDepartment } from '../../services/api';
import type { RegistrationVO, Patient } from '../../types';
import { validateIdCard, validatePhone, validateName, validateAge, parseIdCard } from '../../utils/validators';

/**
 * 护士工作台组件
 * 功能：挂号、患者信息管理与收费入口
 */
const NurseStation: React.FC = () => {
  const { doctors, departments, user, logout } = useStore();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<RegistrationVO[]>([]);
  const [receipt, setReceipt] = useState<RegistrationVO | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; reg: RegistrationVO | null }>({ visible: false, x: 0, y: 0, reg: null });
  
  const FIXED_DOCTOR_ID = '';
  // Calculate initial doctor
  const initialDeptId = 1;
  const initialActiveDoctors = doctors.filter(d => d.deptId === initialDeptId && d.isWorking);
  const initialDoctorId = FIXED_DOCTOR_ID || (initialActiveDoctors.length > 0 ? String(initialActiveDoctors[0].id) : '');
  
  // 表单状态
  const [formData, setFormData] = useState({
    name: '', gender: '1', age: '', idCard: '', phone: '',
    insurance: '自费', type: '初诊', deptId: initialDeptId, doctorId: initialDoctorId
  });


  // 根据身份证号推断性别：仅支持 18 位身份证（倒数第二位奇数为男、偶数为女）
  const inferGenderFromId = (id?: string | null): number | undefined => {
    if (!id) return undefined;
    try {
      const s = String(id).replace(/\s+/g, '');
      const digits = s.replace(/[^0-9]/g, '');
      if (digits.length !== 18) return undefined;
      const idx = 16; // 倒数第二位（0-based 索引）
      const d = Number(digits[idx]);
      if (Number.isNaN(d)) return undefined;
      return d % 2 === 1 ? 1 : 0;
    } catch {
      return undefined;
    }
  };

  // 不从后端读取 gender 字段，仅根据身份证（仅 18 位）推断
  const getGenderLabel = (r: Partial<RegistrationVO> | { idCard?: string; id_card?: string }) => {
    const rr = r as Record<string, unknown>;
    const id = (rr['idCard'] as string | undefined) ?? (rr['id_card'] as string | undefined) ?? undefined;
    const ig = inferGenderFromId(id);
    if (typeof ig === 'number') return ig === 1 ? '男' : '女';
    return '—';
  };

  // 1. 根据科室筛选医生
  const activeDoctors = doctors.filter(d => d.deptId === Number(formData.deptId));

  type ReceivedRegistration = Partial<RegistrationVO> & {
    insurance?: string;
    insurance_type?: string;
    dept_name?: string;
    doctor_name?: string;
    departmentName?: string;
    doctor?: string;
  };

  const [search, setSearch] = useState('');
  const [searchOld, setSearchOld] = useState('');
  const [oldPatients, setOldPatients] = useState<Patient[]>([]);
  const [oldSearchStatus, setOldSearchStatus] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPaymentPrompt, setShowPaymentPrompt] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [refundNotice, setRefundNotice] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });

  const normalizeReg = useCallback((r: ReceivedRegistration): RegistrationVO => {
    const rr = r as unknown as Record<string, unknown>;
    const idCardVal = (rr['idCard'] as string | undefined) ?? (rr['id_card'] as string | undefined) ?? undefined;
    const inferred = inferGenderFromId(idCardVal);
    return {
      ...(r as RegistrationVO),
      gender: typeof inferred !== 'undefined' ? inferred : (typeof r.gender === 'number' ? r.gender : 1),
      // 兼容后端命名：id_card / patient_name / phone 等
      idCard: (rr['idCard'] as string | undefined) ?? (rr['id_card'] as string | undefined) ?? (rr['id_card_no'] as string | undefined) ?? (r as RegistrationVO).idCard,
      patientName: (rr['patientName'] as string | undefined) ?? (rr['patient_name'] as string | undefined) ?? (rr['name'] as string | undefined) ?? (r as RegistrationVO).patientName,
      phone: (rr['phone'] as string | undefined) ?? (rr['mobile'] as string | undefined) ?? (r as RegistrationVO).phone,
      insuranceType: r.insuranceType ?? r.insurance ?? r.insurance_type ?? '自费',
      deptName: r.deptName ?? r.departmentName ?? r.dept_name ?? '',
      doctorName: r.doctorName ?? r.doctor_name ?? r.doctor ?? ''
    };
  }, []);

  const loadPatients = useCallback(async (q?: string) => {
    try {
      const params = q ? { keyword: q } : undefined;
      const controller = new AbortController();
      const raw = await registrationApi.getList(params, { signal: controller.signal });
      logger.debug('[NurseStation] fetched registrations raw:', raw);
      let mapped = (raw || []).map(normalizeReg);
      if (q && q.trim()) {
        const lq = q.trim().toLowerCase();
        mapped = mapped.filter(p => (
          (p.patientName || '').toLowerCase().includes(lq) ||
          (p.idCard || '').toLowerCase().includes(lq) ||
          (p.phone || '').toLowerCase().includes(lq) ||
          String(p.sequence || '').includes(lq)
        ));
      }
      logger.debug('[NurseStation] normalized registrations:', mapped);
      // 使用后端返回顺序，不在前端再次排序
      setPatients(mapped);
    } catch (err) {
      logApiError('NurseStation.loadPatients', err);
    }
  }, [normalizeReg]);



  // 直接根据 id 取消（用于右键菜单调用）
  const cancelById = async (regId?: number) => {
    if (!regId) return;
    const ok = confirm('确认要取消该挂号吗？此操作会将状态设为已取消。');
    if (!ok) return;
    const reason = prompt('请输入取消原因（可选）') || undefined;
    const res = await registrationApi.cancel(regId, reason);
    if (res.success) {
      useStore.getState().notify('取消成功', 'success');
      const ref = await registrationApi.refund(regId);
      if (ref.success) {
        setRefundNotice({ visible: true, message: '退号成功，挂号费已返回原账号' });
      } else {
        setRefundNotice({ visible: true, message: '退号成功，但退费失败：' + (ref.message ?? '') });
      }
      setPatients(prev => prev.filter(p => p.id !== regId));
      setTimeout(() => setRefundNotice({ visible: false, message: '' }), 3000);
    } else {
      useStore.getState().notify('取消失败: ' + (res.message ?? ''), 'error');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        // 先加载挂号列表，再加载科室与医生，避免在 effect 同步体中直接调用 setState
        await loadPatients();
        const depts = await basicApi.getDepartments();
        logger.debug('[NurseStation] fetched departments raw:', depts);
        const mappedDepts = depts.map((d: RawDepartment) => ({ id: d.id, name: d.name }));
        useStore.getState().setDepartments(mappedDepts);
        logger.debug('[NurseStation] mapped departments:', mappedDepts);

        // 根据首个科室（或初始 deptId）加载医生
        const startDeptId = mappedDepts.length > 0 ? mappedDepts[0].id : initialDeptId;
        const ds = await basicApi.getDoctors(startDeptId, { signal: controller.signal });
        logger.debug('[NurseStation] fetched doctors raw for dept', startDeptId, ':', ds);
        const mappedDocs = ds.map((d: RawDoctor) => ({
          id: d.id,
          name: d.name || d.doctorNo || '',
          deptId: d.departmentId ?? 0,
          deptName: d.departmentName ?? '',
          title: d.title || '',
          isWorking: (typeof d.status !== 'undefined') ? d.status === 1 : true,
          registrationFee: d.registrationFee
        }));
        useStore.getState().setDoctors(mappedDocs);
        logger.debug('[NurseStation] mapped doctors:', mappedDocs);
        // 将表单的 deptId 设为 startDeptId，并清空医生选择
        setFormData(prev => ({ ...prev, deptId: startDeptId, doctorId: '' }));
      } catch (err) {
        if (isCanceledError(err)) return;
        logApiError('NurseStation.init', err);
      }
    })();
    return () => { controller.abort(); };
  }, [loadPatients]);

  // 切换科室时加载对应医生
  const handleDeptClick = async (newDeptId: number) => {
    setFormData(prev => ({ ...prev, deptId: newDeptId, doctorId: '' }));
    const controller = new AbortController();
    try {
      const ds = await basicApi.getDoctors(newDeptId, { signal: controller.signal });
      const mappedDocs = ds.map((d: RawDoctor) => ({
        id: d.id,
        name: d.name || d.doctorNo || '',
        deptId: d.departmentId ?? 0,
        deptName: d.departmentName ?? '',
        title: d.title || '',
        isWorking: (typeof d.status !== 'undefined') ? d.status === 1 : true,
        registrationFee: d.registrationFee
      }));
      useStore.getState().setDoctors(mappedDocs);
    } catch (err) {
      if (isCanceledError(err)) return;
      logApiError('NurseStation.handleDeptClick', err);
    }
  };

  // 右键菜单：显示菜单并记录选中项
  const handleRowContextMenu = (e: React.MouseEvent, reg: RegistrationVO) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, reg });
  };

  const closeContextMenu = () => setContextMenu({ visible: false, x: 0, y: 0, reg: null });

  const handleShowDetailsFromMenu = () => {
    if (contextMenu.reg) setReceipt(contextMenu.reg);
    closeContextMenu();
  };

  const handleCancelFromMenu = async () => {
    if (contextMenu.reg) {
      await cancelById(contextMenu.reg.id);
    }
    closeContextMenu();
  };

  // 点击页面其它位置时关闭菜单
  useEffect(() => {
    const onDocClick = () => { if (contextMenu.visible) closeContextMenu(); };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [contextMenu.visible]);

  // 3. 身份证自动识别（仅在输入为 18 位时触发）
  const handleIdBlur = async () => {
    if (!formData.idCard || formData.idCard.trim().length !== 18) return;
      // 优先查询患者表
      const controller = new AbortController();
      try {
        let result = await patientApi.findByIdCard(formData.idCard, { signal: controller.signal });
        logger.debug('[NurseStation] patientApi.findByIdCard result:', result);
        if (!result) {
          // 回退到 registrationApi.checkPatient
          result = await registrationApi.checkPatient(formData.idCard, { signal: controller.signal });
          logger.debug('[NurseStation] fallback registrationApi.checkPatient result:', result);
        }
        if (!result) return;
        
        const list = Array.isArray(result) ? result : [result];
        if (list.length > 0) {
          setErrors({});
            if (list.length === 1) {
            const p = list[0];
            setFormData(prev => {
              const gInferred = inferGenderFromId(p.id_card ?? undefined);
              return ({
                ...prev,
                name: p.name || prev.name,
                gender: String(typeof gInferred !== 'undefined' ? gInferred : (prev.gender ?? '1')),
                age: String(p.age ?? prev.age),
                phone: p.phone ?? prev.phone,
                idCard: p.id_card ?? prev.idCard,
                insurance: p.insuranceType ?? prev.insurance,
                type: '复诊'
              });
            });
          } else {
            setOldPatients(list);
          }
        }
      } catch (err) {
        if (isCanceledError(err)) return;
        logApiError('NurseStation.handleIdBlur', err);
      }
  };

  const handleSearchOld = async () => {
    if (!searchOld || !searchOld.trim()) {
      setOldSearchStatus('idle');
      setOldPatients([]);
      return;
    }
    setOldSearchStatus('loading');
    setErrors({}); // 清除之前的验证错误，响应用户“查询后不需要显示输入有效的身份信息”的需求
    logger.debug('[NurseStation] searchOld ->', searchOld.trim());
    try {
      const controller = new AbortController();
      const result = await registrationApi.checkPatient(searchOld.trim(), { signal: controller.signal });
      logger.debug('[NurseStation] checkPatient result:', result);
      if (!result) {
        setOldPatients([]);
        setOldSearchStatus('not-found');
        return;
      }
      const list = Array.isArray(result) ? result : [result];
      setOldPatients(list);
      setOldSearchStatus(list.length > 0 ? 'idle' : 'not-found');
    } catch (err) {
      logApiError('NurseStation.handleSearchOld', err);
      setOldPatients([]);
      setOldSearchStatus('error');
    }
  };

  const fillFromOld = (p: Patient) => {
    setFormData(prev => {
      const gInferred = inferGenderFromId(p.id_card ?? undefined);
      return ({
        ...prev,
        name: p.name || prev.name,
        gender: String(typeof gInferred !== 'undefined' ? gInferred : (prev.gender ?? '1')),
        age: String(p.age ?? prev.age),
        phone: p.phone ?? prev.phone,
        idCard: p.id_card ?? prev.idCard,
        insurance: p.insuranceType ?? prev.insurance,
        type: '复诊'
      });
    });
    setOldPatients([]);
  };

  // 4. 提交挂号
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    // 前端验证，使用完整的校验逻辑
    const newErrors: Record<string, string> = {};
    
    // 姓名验证
    const nameValidation = validateName(formData.name);
    if (!nameValidation.valid) {
      newErrors.name = nameValidation.message || '请输入患者姓名';
    }
    
    // 身份证验证（含校验位）
    const idCardValidation = validateIdCard(formData.idCard);
    if (!idCardValidation.valid) {
      newErrors.idCard = idCardValidation.message || '请输入有效的18位身份证号';
    }
    
    // 手机号验证
    const phoneValidation = validatePhone(formData.phone);
    if (!phoneValidation.valid) {
      newErrors.phone = phoneValidation.message || '请输入有效的手机号码';
    }
    
    // 年龄验证
    if (formData.age) {
      const ageValidation = validateAge(formData.age);
      if (!ageValidation.valid) {
        newErrors.age = ageValidation.message || '请输入有效年龄';
      }
    }
    
    // 医生验证
    if (!formData.doctorId) {
      newErrors.doctor = '请选择医生';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    // 从身份证解析信息
    const idCardInfo = parseIdCard(formData.idCard);

    // 生成支付流水号
    const generateTransactionNo = (): string => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `WX${timestamp}${random}`; // 默认使用微信支付
    };

    // 构造数据（包含支付信息，一次性完成挂号和支付）
    const payload = {
      patientName: formData.name,
      idCard: formData.idCard,
      gender: idCardInfo?.gender ?? Number(formData.gender),
      age: idCardInfo?.age ?? (Number(formData.age) || 0),
      phone: formData.phone,
      deptId: Number(formData.deptId),
      doctorId: Number(formData.doctorId),
      regFee: 20,
      insuranceType: formData.insurance,
      type: formData.type,
      paymentMethod: 3, // 3=微信支付
      transactionNo: generateTransactionNo()
    };

    logger.debug('register payload:', payload);

    // 显示支付提示
    setPaymentAmount(payload.regFee);
    setShowPaymentPrompt(true);
    
    // 延迟3秒后执行挂号流程
    setTimeout(async () => {
      setShowPaymentPrompt(false);
      
      try {
        // 创建挂号记录（后端会自动处理支付）
        const res = await registrationApi.create(payload);
        
        setLoading(false);

        if (!res.success || !res.data) {
          useStore.getState().notify('挂号失败: ' + (res.message ?? '未知错误'), 'error');
          return;
        }

        // 归一化后显示回执
        const normalizeReg = (r: ReceivedRegistration): RegistrationVO => ({
          ...(r as RegistrationVO),
          insuranceType: r.insuranceType ?? r.insurance ?? r.insurance_type ?? '自费',
          deptName: r.deptName ?? r.departmentName ?? r.dept_name ?? '',
          doctorName: r.doctorName ?? r.doctor_name ?? r.doctor ?? ''
        });
        const normalized = normalizeReg(res.data);
        setReceipt(normalized);
        
        // 重置表单，但保留科室选择
        setFormData(prev => ({ ...prev, name: '', age: '', idCard: '', phone: '' }));
        
        // 重新从后端加载列表以保证顺序与服务器一致
        try { 
          await loadPatients(); 
          logger.debug('[NurseStation] List refreshed after registration');
        } catch (e) { 
          logger.debug('refresh after register failed', e); 
        }
        
        useStore.getState().notify('挂号成功并支付完成', 'success');
      } catch (err) {
        setLoading(false);
        logger.error('Registration process failed:', err);
        useStore.getState().notify('挂号流程出错', 'error');
      }
    }, 3000);
  };

  return (
    <>
    <div className="flex h-full gap-4 p-4 bg-slate-50 overflow-hidden">
      {/* --- 左侧：挂号表单 --- */}
      <div className="w-105 bg-white rounded-xl shadow-sm flex flex-col border border-slate-200">
        <div className="p-5 border-b bg-linear-to-r from-teal-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-100 text-teal-600 rounded-lg"><Plus size={20} /></div>
            <div>
              <h2 className="font-bold text-slate-800 text-lg">挂号建档</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400">操作员</span>
                <div className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-md text-[11px] font-medium flex items-center gap-1">
                  <UserIcon size={10} />
                  {user?.name}
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="退出登录"
          >
            <LogOut size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form onSubmit={handleRegister} className="space-y-4 p-2">
            {/* 1. 身份识别 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-700 flex items-center gap-2"><span className="w-1 h-4 bg-teal-500 rounded" /> 身份信息</div>
                <div className="text-xs text-slate-400">已注册患者请先搜索</div>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={searchOld}
                  onChange={e => {
                    setSearchOld(e.target.value);
                    if (oldSearchStatus !== 'idle') setOldSearchStatus('idle');
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleSearchOld()}
                  placeholder="搜索老患者：姓名/身份证/手机号"
                  className="flex-1 text-sm p-2.5 border rounded-md bg-white"
                />
                <button type="button" onClick={handleSearchOld} className="px-3 py-1.5 bg-slate-100 rounded">查患者</button>
              </div>
              {oldPatients.length > 0 && (
                <div className="mt-2 bg-white border rounded p-2 max-h-40 overflow-auto">
                  {oldPatients.map(p => (
                    <div key={p.main_id} className="flex items-center justify-between py-1 border-b last:border-b-0">
                      <div className="text-sm">
                        <div className="font-medium">{p.name} <span className="text-xs text-slate-400">({p.id_card})</span></div>
                        <div className="text-xs text-slate-400">{p.phone}</div>
                      </div>
                      <div>
                        <button type="button" onClick={() => fillFromOld(p)} className="px-2 py-1 text-sm bg-teal-50 rounded">填充</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {oldSearchStatus === 'loading' && <div className="mt-2 text-xs text-slate-500">查询中…</div>}
              {oldSearchStatus === 'not-found' && <div className="mt-2 text-xs text-red-500">未找到匹配的患者</div>}
              {oldSearchStatus === 'error' && <div className="mt-2 text-xs text-red-500">查询出错，请查看控制台或网络请求</div>}

              <div className="relative">
                <CreditCard className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  className={`w-full pl-10 p-3 border rounded-lg text-sm outline-none transition ${errors.idCard ? 'border-red-500 bg-red-50' : 'bg-slate-50'}`}
                  placeholder="扫描或输入身份证号"
                  value={formData.idCard}
                  onChange={e => setFormData({...formData, idCard: e.target.value})}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.idCard; return c; })}
                  onBlur={handleIdBlur}
                />
                {errors.idCard && <div className="text-xs text-red-500 mt-1">{errors.idCard}</div>}
              </div>
            </div>

            {/* 2. 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input
                  className={`w-full p-3 border rounded-lg text-sm transition ${errors.name ? 'border-red-500 bg-red-50' : 'bg-white'}`}
                  placeholder="患者姓名"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.name; return c; })}
                />
                {errors.name && <div className="text-xs text-red-500 mt-1">{errors.name}</div>}
              </div>

              <div className="p-3 border rounded-lg text-sm bg-white flex items-center justify-between">
                <div className="text-sm text-slate-700">{getGenderLabel({ idCard: formData.idCard })}</div>
                <input type="hidden" name="gender" value={formData.gender} />
              </div>

              <div className="relative">
                <input type="number" className="w-full p-3 border rounded-lg text-sm" placeholder="年龄" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
                <span className="absolute right-3 top-3 text-xs text-slate-400">岁</span>
              </div>

              <div className="col-span-2 relative">
                <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  className={`w-full pl-10 p-3 border rounded-lg text-sm transition ${errors.phone ? 'border-red-500 bg-red-50' : 'bg-white'}`}
                  placeholder="手机号码"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.phone; return c; })}
                />
                {errors.phone && <div className="text-xs text-red-500 mt-1">{errors.phone}</div>}
              </div>

              <div className="col-span-2 relative">
                <ShieldCheck className="absolute left-3 top-3 text-slate-400" size={18} />
                <select className="w-full pl-10 p-3 border rounded-lg text-sm bg-white" value={formData.insurance} onChange={e => setFormData({...formData, insurance: e.target.value})}>
                  <option value="自费">自费</option>
                  <option value="职工医保">职工医保</option>
                  <option value="居民医保">居民医保</option>
                </select>
              </div>
            </div>

            <div className="border-t border-dashed my-2" />

            {/* 3. 挂号选项 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-700 flex items-center gap-2"><span className="w-1 h-4 bg-blue-500 rounded" /> 挂号信息</div>
                <div className="text-xs text-slate-400">选择科室与医生</div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {departments.map(dept => (
                  <button 
                    key={dept.id} 
                    type="button"
                    onClick={() => handleDeptClick(dept.id)}
                    className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap transition-colors ${Number(formData.deptId) === dept.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 max-h-56 overflow-y-auto">
                {activeDoctors.length > 0 ? (
                  activeDoctors.map(doc => (
                  <div
                    key={doc.id}
                    onClick={FIXED_DOCTOR_ID ? undefined : () => { setFormData(prev => ({...prev, doctorId: String(doc.id)})); setErrors(prev => { const c = {...prev}; delete c.doctor; return c; }); }}
                    className={`p-3 border rounded-xl ${FIXED_DOCTOR_ID ? 'cursor-not-allowed' : 'cursor-pointer'} transition-all ${String(formData.doctorId) === String(doc.id) ? 'bg-teal-50 border-teal-500 shadow-sm' : 'bg-white border-slate-200 hover:border-teal-300'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${String(formData.doctorId) === String(doc.id) ? 'bg-teal-200 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
                        {doc.name?.[0] ?? '-'}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-800">{doc.name}</div>
                        <div className="text-xs text-slate-500">{doc.title} • {doc.deptName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-slate-700">{doc.registrationFee ? `¥${doc.registrationFee}` : '¥--'}</div>
                        <div className={`text-xs mt-1 ${doc.isWorking ? 'text-green-600' : 'text-red-400'}`}>{doc.isWorking ? '在岗' : '停诊'}</div>
                      </div>
                    </div>
                  </div>
                ))) : (
                  <div className="col-span-2 text-center text-xs text-slate-400 py-4">该科室暂无医生</div>
                )}
              </div>
              {errors.doctor && <div className="text-xs text-red-500">{errors.doctor}</div>}
            </div>

            <div className="pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className={`w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex justify-center items-center gap-2 shadow-lg transition ${loading ? 'opacity-70' : 'active:scale-[0.98]'}`}
              >
                {loading ? '提交中...' : <><ClipboardList size={20}/> 确认挂号</>}
              </button>
            </div>
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
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadPatients(search)}
              placeholder="搜索 姓名/身份证/手机号"
              className="text-sm p-2 border rounded-md"
            />
            <button onClick={() => loadPatients(search)} className="ml-2 px-3 py-1 text-sm bg-slate-100 rounded">搜索</button>
            <div className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold ml-3">Total: {patients.length}</div>
          </div>
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
                <tr key={p.id} className="hover:bg-slate-50 transition-colors" onContextMenu={e => handleRowContextMenu(e, p)}>
                  <td className="p-4 pl-6">
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">{p.queueNo ? `${p.queueNo}号` : (typeof p.sequence !== 'undefined' && p.sequence !== null ? `${p.sequence}号` : '-')}</span>
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
    {showPaymentPrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative w-full max-w-xs bg-white p-6 rounded-lg shadow-xl z-10 text-center">
          <div className="text-lg font-bold mb-2">请在手机上完成缴费</div>
          <div className="text-3xl font-extrabold text-teal-600">¥{paymentAmount.toFixed(2)}</div>
          <div className="text-sm text-slate-500 mt-2">支付成功后自动继续挂号流程</div>
        </div>
      </div>
    )}

    {refundNotice.visible && (
      <div className="fixed bottom-8 right-8 z-50">
        <div className="bg-white border p-4 rounded-lg shadow-md w-72">
          <div className="font-medium text-slate-800">退费提示</div>
          <div className="text-sm text-slate-600 mt-2">{refundNotice.message}</div>
        </div>
      </div>
    )}
    {contextMenu.visible && contextMenu.reg && (
      <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 60 }} onClick={e => e.stopPropagation()}>
        <div className="bg-white border rounded shadow-md py-1">
          <button onClick={handleShowDetailsFromMenu} className="block px-4 py-2 text-sm w-full text-left">查看挂号单</button>
          <button onClick={handleCancelFromMenu} className="block px-4 py-2 text-sm w-full text-left text-red-600">退号</button>
        </div>
      </div>
    )}
    </>
  );
};

export default NurseStation;