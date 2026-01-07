// src/pages/NurseStation/index.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Plus, Activity, CreditCard, Phone, ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';
import { useStore } from '../../store/store';
import { basicApi, registrationApi, patientApi, logApiError, isCanceledError, api } from '../../services/api';
import * as logger from '../../services/logger';
import type { RawDoctor, RawDepartment } from '../../services/api';
import type { RegistrationVO, Patient } from '../../types';
import { validateIdCard, validatePhone, validateName, validateAge, parseIdCard } from '../../utils/validators';
console.log('[NurseStation-test] module loaded');

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
  const pendingRegsRef = useRef<RegistrationVO[]>([]);
  
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
      return d % 2 === 1 ? 1 : 0; // 奇数=1男, 偶数=0女
    } catch {
      return undefined;
    }
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
  // 当身份证识别或通过老用户匹配后，将锁定部分字段以只读显示（防止误修改）
  // parsedLocked: 身份证能解析时（仅锁性别/年龄等派生字段，姓名仍可输入）
  // lockedFromId: 当匹配到单个老用户并填充时（锁定全部相关字段，姓名/电话/医保等不可修改）
  const [parsedLocked, setParsedLocked] = useState(false);
  const [lockedFromId, setLockedFromId] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doctorLoadError, setDoctorLoadError] = useState(false);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [showPaymentPrompt] = useState(false);
  const [paymentAmount] = useState<number>(0);
  const [refundNotice, setRefundNotice] = useState<{ visible: boolean; message: string }>({ visible: false, message: '' });
  const [cancelDialog, setCancelDialog] = useState<{ visible: boolean; regId?: number; reason: string }>({ visible: false, reason: '' });

  const normalizeReg = useCallback((r: ReceivedRegistration): RegistrationVO => {
    const rr = r as unknown as Record<string, unknown>;
    const idCardVal = (rr['idCard'] as string | undefined) ?? (rr['id_card'] as string | undefined) ?? undefined;
    const inferred = inferGenderFromId(idCardVal);
    // normalize gender: prefer inferred idCard, else use provided gender (number or numeric string), default to 1
    let genderVal: number | undefined = undefined;
    if (typeof inferred !== 'undefined') genderVal = inferred;
    else if (typeof r.gender === 'number') genderVal = r.gender;
    else if (typeof r.gender === 'string' && /^\d+$/.test(r.gender)) genderVal = parseInt(r.gender, 10);

    // normalize status: accept number or numeric string, default to 0 (待就诊)
    let statusVal: number = 0;
    if (typeof r.status === 'number') statusVal = r.status as number;
    else if (typeof r.status === 'string' && /^\d+$/.test(r.status)) statusVal = parseInt(r.status as string, 10);

    const statusMap: Record<number, string> = {
      0: '待就诊',
      1: '已就诊',
      2: '已取消',
      3: '已退费',
      4: '待就诊',
      5: '就诊中'
    };

    // 始终使用前端的 statusMap 映射，不使用后端返回的 statusDesc
    const statusDesc = statusMap[statusVal] ?? '候诊';

    return {
      ...(r as RegistrationVO),
      gender: typeof genderVal !== 'undefined' ? genderVal : 1,      // 兼容后端命名：id_card / patient_name / phone 等，默认 1=男
      idCard: (rr['idCard'] as string | undefined) ?? (rr['id_card'] as string | undefined) ?? (rr['id_card_no'] as string | undefined) ?? (r as RegistrationVO).idCard,
      patientName: (rr['patientName'] as string | undefined) ?? (rr['patient_name'] as string | undefined) ?? (rr['name'] as string | undefined) ?? (r as RegistrationVO).patientName,
      phone: (rr['phone'] as string | undefined) ?? (rr['mobile'] as string | undefined) ?? (r as RegistrationVO).phone,
      insuranceType: r.insuranceType ?? r.insurance ?? r.insurance_type ?? '自费',
      deptName: r.deptName ?? r.departmentName ?? r.dept_name ?? '',
      doctorName: r.doctorName ?? r.doctor_name ?? r.doctor ?? '',
      status: statusVal,
      statusDesc
    };
  }, []);

  const loadPatients = useCallback(async (q?: string) => {
    try {
      const params = q ? { keyword: q } : undefined;
      const controller = new AbortController();
      const raw = await registrationApi.getList(params, { signal: controller.signal });
      logger.debug('[NurseStation] fetched registrations raw:', raw);
      // 检查第一条数据的性别字段
      if (raw && raw.length > 0) {
        logger.debug('[NurseStation] 第一条数据性别字段:', { 
          genderDesc: raw[0].genderDesc, 
          gender: raw[0].gender,
          patientName: raw[0].patientName 
        });
      }
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
      logger.debug('[NurseStation] normalized registrations (before sort):', mapped);
      // 按排队号/sequence 升序排序
      const extract = (s: string) => {
        const m = /^([A-Za-z]*)(\d*)$/.exec(s) || ['', s, ''];
        return { prefix: m[1] || '', num: parseInt(m[2] || '0', 10) || 0 };
      };
      mapped.sort((a, b) => {
        const qA = a.queueNo || (a.sequence ? String(a.sequence) : '');
        const qB = b.queueNo || (b.sequence ? String(b.sequence) : '');
        const eA = extract(String(qA));
        const eB = extract(String(qB));
        if (eA.prefix === eB.prefix) return eA.num - eB.num;
        return eA.prefix.localeCompare(eB.prefix);
      });
      logger.debug('[NurseStation] normalized registrations (after sort):', mapped);

      // 合并：先显示后端返回的已存在挂号（升序），再把本地新增的 pending 添加到末尾
      const merged = [
        ...mapped,
        ...pendingRegsRef.current.filter(p => !mapped.some(m => m.id === p.id))
      ];
      setPatients(merged);
    } catch (err) {
      logApiError('NurseStation.loadPatients', err);
    }
  }, [normalizeReg]);



  // 直接根据 id 取消（用于右键菜单调用）
  const cancelById = async (regId?: number) => {
    if (!regId) return;
    // 显示取消原因输入弹窗
    setCancelDialog({ visible: true, regId, reason: '' });
  };

  // 执行取消操作
  const executeCancelRegistration = async () => {
    const { regId, reason } = cancelDialog;
    if (!regId) return;
    setCancelDialog({ visible: false, reason: '' });
    
    try {
      const cancelRes = await api.put(`/nurse/registrations/${regId}/cancel`, reason ? `reason=${encodeURIComponent(reason)}` : '', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const cancelData = cancelRes?.data;
      const cancelSuccess = cancelData?.code === 200 || cancelData?.success === true;
      if (!cancelSuccess) {
        setRefundNotice({ visible: true, message: '❌ 取消失败：' + (cancelData?.message ?? '未知错误') });
        setTimeout(() => setRefundNotice({ visible: false, message: '' }), 3000);
        return;
      }

      // 取消成功后仍调用退款接口，但不展示即时到账提示，改为延迟到账提示（模拟需管理员审核的流程）
      try {
        await api.put(`/nurse/registrations/${regId}/refund`, '', {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
      } catch (refundErr) {
        // 记录异常但不打断用户流程；真实环境下仍需后台审核
        logApiError('NurseStation.executeCancelRegistration.refund', refundErr);
      }
      setRefundNotice({ visible: true, message: '✅ 退号成功，退款将在 1 个工作日内原路返回（需管理员审核）' });

      // 无论退费成功与否，都刷新列表以反映取消状态
      await loadPatients();
      // 广播收费变更，通知管理员页面刷新统计
      try { window.dispatchEvent(new CustomEvent('charges:updated', { detail: { source: 'nurse-cancel', id: regId } })); } catch (e) { console.error('dispatch charges:updated failed', e); }
      setTimeout(() => setRefundNotice({ visible: false, message: '' }), 3000);
    } catch (err) {
      logApiError('NurseStation.executeCancelRegistration', err);
      setRefundNotice({ visible: true, message: '❌ 操作失败，请稍后重试' });
      setTimeout(() => setRefundNotice({ visible: false, message: '' }), 3000);
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
        setDoctorLoading(true);
        try {
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
          const prevForDept = useStore.getState().doctors.filter(d => d.deptId === startDeptId);
          if (mappedDocs.length > 0) {
            useStore.getState().setDoctors(mappedDocs);
            setDoctorLoadError(false);
          } else if (prevForDept.length > 0) {
            // 保留旧数据，仅标记错误（不 notify）
            setDoctorLoadError(true);
          } else {
            useStore.getState().setDoctors([]);
            setDoctorLoadError(true);
          }
          logger.debug('[NurseStation] mapped doctors:', mappedDocs);
        } finally {
          setDoctorLoading(false);
        }
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
    setDoctorLoading(true);
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
        const prevForDept = useStore.getState().doctors.filter(d => d.deptId === newDeptId);
        if (mappedDocs.length > 0) {
          useStore.getState().setDoctors(mappedDocs);
          setDoctorLoadError(false);
        } else if (prevForDept.length > 0) {
          // 保留旧数据，仅标记错误
          setDoctorLoadError(true);
        } else {
          useStore.getState().setDoctors([]);
          setDoctorLoadError(true);
        }
      } catch (err) {
        if (isCanceledError(err)) return;
        logApiError('NurseStation.handleDeptClick', err);
        setDoctorLoadError(true);
      } finally {
        setDoctorLoading(false);
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

  // 身份证输入实时解析年龄和性别
  const handleIdCardChange = (value: string) => {
    setFormData(prev => ({ ...prev, idCard: value }));
    setLockedFromId(false);
    
    // 实时解析身份证的年龄和性别
    if (value.trim().length === 18) {
      const parsed = parseIdCard(value);
      if (parsed) {
        setFormData(prev => ({
          ...prev,
          idCard: value,
          age: String(parsed.age),
          gender: String(parsed.gender)
        }));
        setParsedLocked(true);
      } else {
        setParsedLocked(false);
      }
    } else {
      setParsedLocked(false);
    }
  };

  // 3. 身份证自动识别（仅在输入为 18 位时触发）
  const handleIdBlur = async () => {
    if (!formData.idCard || formData.idCard.trim().length !== 18) return;
    
    // 从身份证解析年龄和性别（用于填充老患者数据）
    const parsed = parseIdCard(formData.idCard);
    
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
          const pName = p.name || '';
          const pPhone = p.phone || '';
          setFormData(prev => {
            const gInferred = inferGenderFromId(p.id_card ?? undefined);
            const ageFromId = parsed?.age ?? prev.age;
            return ({
                ...prev,
                name: pName || prev.name,
                gender: String(typeof gInferred !== 'undefined' ? gInferred : (prev.gender ?? '0')),
                age: String(ageFromId),
                phone: pPhone || prev.phone,
                idCard: p.id_card ?? prev.idCard,
                insurance: p.insuranceType ?? prev.insurance,
                type: '复诊'
              });
            });
          // 只有当姓名和手机号都有值时才锁定字段
          if (pName && pPhone) {
            setLockedFromId(true);
          }
          setParsedLocked(true);
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
      // 如果只有一个匹配，自动填充并清理搜索结果与输入
      if (list.length === 1) {
        fillFromOld(list[0]);
        setOldPatients([]);
        setSearchOld('');
        setOldSearchStatus('idle');
        return;
      }
      setOldPatients(list);
      setOldSearchStatus(list.length > 0 ? 'idle' : 'not-found');
    } catch (err) {
      logApiError('NurseStation.handleSearchOld', err);
      setOldPatients([]);
      setOldSearchStatus('error');
    }
  };

  const fillFromOld = (p: Patient) => {
    // 兼容 camelCase 和 snake_case
    const pAny = p as unknown as Record<string, unknown>;
    const idCard = (pAny['idCard'] ?? pAny['id_card'] ?? '') as string;
    const phone = (pAny['phone'] ?? '') as string;
    const name = (p.name ?? '') as string;
    const age = (pAny['age'] ?? null) as number | null;
    const insuranceType = (pAny['insuranceType'] ?? pAny['insurance_type'] ?? null) as string | null;
    
    const parsed = idCard ? parseIdCard(idCard) : null;
    setFormData(prev => {
      const gInferred = inferGenderFromId(idCard || undefined);
      return ({
        ...prev,
        name: name || prev.name,
        gender: String(typeof gInferred !== 'undefined' ? gInferred : (parsed?.gender ?? prev.gender ?? '0')),
        age: String(parsed?.age ?? age ?? prev.age),
        phone: phone || prev.phone,
        idCard: idCard || prev.idCard,
        insurance: insuranceType ?? prev.insurance,
        type: '复诊'
      });
    });
    // 只有当姓名和手机号都有值时才锁定字段
    // 这样可以避免老患者数据不完整时无法编辑的问题
    if (name && phone) {
      setLockedFromId(true);
    }
    setParsedLocked(true);
    setOldPatients([]);
  };

  // 4. 提交挂号
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[NurseStation-test] handleRegister triggered', formData);
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
      console.log('[NurseStation-test] validation errors', newErrors);
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
      gender: idCardInfo?.gender ?? (typeof formData.gender === 'string' && /^\d+$/.test(formData.gender) ? parseInt(formData.gender, 10) : 1),
      age: idCardInfo?.age ?? (Number(formData.age) || 0),
      phone: formData.phone,
      deptId: Number(formData.deptId),
      doctorId: Number(formData.doctorId),
      regFee: 20,
      insuranceType: formData.insurance,
      type: formData.type,
      status: 0, // 明确传入默认状态为 0（待就诊）
      paymentMethod: 3, // 3=微信支付
      transactionNo: generateTransactionNo()
    }; 

    logger.debug('formData before submit:', formData);
    logger.debug('register payload:', payload);

    // 客户端预校验必填字段，避免请求被后端拒绝
    if (!payload.patientName || !String(payload.patientName).trim()) {
      setLoading(false);
      useStore.getState().notify('患者姓名不能为空，请检查表单', 'error');
      return;
    }
    if (!payload.phone || !String(payload.phone).trim()) {
      setLoading(false);
      useStore.getState().notify('联系电话不能为空，请检查表单', 'error');
      return;
    }

    // 不再在一开始弹出支付提示，直接等待支付结果并在支付完成后弹出挂号单或通知收费处。
    
    try {
      // 创建挂号记录（后端会自动处理支付）
      const res = await registrationApi.create(payload);
      console.log('[NurseStation-test] registrationApi.create resolved', res);
      
      setLoading(false);

      if (!res.success || !res.data) {
        useStore.getState().notify('挂号失败: ' + (res.message ?? '未知错误'), 'error');
        return;
      }

      // 使用外部 normalizeReg 归一化后显示回执
      let normalized = normalizeReg(res.data);
      // 默认缺失状态时回退为待就诊
      if (typeof normalized.status !== 'number') {
        normalized = { ...normalized, status: 0 };
      }
      if (!normalized.statusDesc) {
        normalized = { ...normalized, statusDesc: normalized.status === 0 ? '待就诊' : '候诊' };
      }
      // 如果后端没有返回 queueNo，基于当前科室生成本地队列号(A/B/C + 3位序号)
      if (!normalized.queueNo) {
        try {
          const deptIndex = departments.findIndex(d => d.id === Number(normalized.deptId || formData.deptId));
          const letter = String.fromCharCode(65 + (deptIndex >= 0 ? deptIndex : 0)); // 0 -> 'A'
          const sameDeptCount = patients.filter(p => Number(p.deptId) === Number(normalized.deptId || formData.deptId)).length || 0;
          const seq = sameDeptCount + 1;
          normalized = { ...normalized, queueNo: `${letter}${String(seq).padStart(3, '0')}` } as RegistrationVO;
        } catch {
          // ignore
        }
      }

      const refreshList = () => {
        // 记录本地新增，防止后端列表刷新时丢失；将新挂号追加到队列末尾
        pendingRegsRef.current = [...pendingRegsRef.current.filter(p => p.id !== normalized.id), normalized];
        // 将新挂号追加到本地列表底部，若已存在则去重后替换
        setPatients(prev => [...prev.filter(p => p.id !== normalized.id), normalized]);
        // 不再立即强制重载后端列表，避免后端未返回新挂号时覆盖本地插入
      };

      // 先插入列表，后续支付判断不会阻塞展示
      refreshList();
      console.log('[NurseStation-test] refreshList inserted', normalized);

      const resetForm = () => {
        // 重置表单，但保留科室选择，同时清除锁定状态和错误信息
        setFormData(prev => ({ ...prev, name: '', age: '', idCard: '', phone: '', gender: '1', insurance: '自费', type: '初诊' }));
        setLockedFromId(false);
        setParsedLocked(false);
        setErrors({});
      };

      try {
        // 使用新的护士收费API直接收取挂号费
        const registrationFee = normalized.registrationFee || normalized.regFee || 0; // 从挂号单获取挂号费
        const mockTransactionNo = `NURSE${Date.now()}`; // 模拟支付流水号
        
        const paidAmountStr = typeof registrationFee === 'number'
          ? registrationFee.toFixed(2)
          : (registrationFee ?? '0.00');
        const paymentResult = await registrationApi.payRegistrationFee(normalized.id, {
          paymentMethod: 1, // 默认现金支付
          paidAmount: paidAmountStr,
          transactionNo: mockTransactionNo
        });
        
        console.log('[NurseStation-test] payRegistrationFee result', paymentResult);
        
        if (paymentResult.success) {
          // 缴费成功，保持状态为"待就诊"(0)，并弹出挂号单卡片
          const paidRegistration = { ...normalized, status: 0, statusDesc: '待就诊' };
          setReceipt(paidRegistration);
          // 更新列表中的状态
          setPatients(prev => prev.map(p => p.id === normalized.id ? paidRegistration : p));
          resetForm();
          useStore.getState().notify('挂号成功并已收费', 'success');
        } else {
          // 缴费失败（可能已经收费过了），仍然弹出挂号单
          const isDuplicatePayment = paymentResult.message?.includes('已支付') || paymentResult.message?.includes('已缴');
          // 保持状态为待就诊
          const finalRegistration = { ...normalized, status: 0, statusDesc: '待就诊' };
          setReceipt(finalRegistration);
          if (isDuplicatePayment) {
            setPatients(prev => prev.map(p => p.id === normalized.id ? finalRegistration : p));
          }
          resetForm();
          // 如果是重复缴费错误，提示已支付；否则显示错误信息
          if (isDuplicatePayment) {
            useStore.getState().notify('挂号成功（挂号费已支付）', 'success');
          } else {
            useStore.getState().notify(paymentResult.message || '挂号已创建，但收费失败', 'warn');
          }
        }
      } catch (err) {
        logApiError('NurseStation.payRegistrationFee', err);
        // 即使收费出错，也要显示挂号单
        setReceipt(normalized);
        resetForm();
        useStore.getState().notify('挂号已创建', 'warn');
      }
    } catch (err) {
      setLoading(false);
      logger.error('Registration process failed:', err);
      useStore.getState().notify('挂号流程出错', 'error');
    }
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    try {
      if (!target) return;
      // 如果点击目标或其祖先是输入/按钮/可交互元素/label，则不触发全局 blur
      if (target.closest('input, textarea, select, button, label, [contenteditable="true"], a, [role="button"]')) return;
      // 否则在下一轮事件循环后 blur 当前焦点元素（避免 label 在 mouseup 时重新 focus）
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
          active.blur();
        }
      }, 0);
    } catch {
      // ignore
    }
  };

  return (
    <>
    <div onMouseDown={handleContainerMouseDown} className="flex h-full gap-4 p-4 bg-slate-50 overflow-hidden select-none caret-transparent">
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
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSearchOld();
                    }
                  }}
                  placeholder="搜索老患者：姓名/身份证/手机号"
                  className="flex-1 text-sm p-2.5 border rounded-md bg-white"
                />
                <button type="button" onClick={handleSearchOld} className="px-3 py-1.5 bg-slate-100 rounded">查患者</button>
              </div>
              {oldPatients.length > 0 && (
                <div className="mt-2 bg-white border rounded p-2 max-h-40 overflow-auto">
                  {oldPatients.map(p => {
                    const pAny = p as unknown as Record<string, unknown>;
                    const genderDesc = (pAny['genderDesc'] ?? pAny['gender_desc'] ?? (p.gender === 0 ? '女' : p.gender === 1 ? '男' : '')) as string;
                    return (
                      <div key={p.main_id} className="flex items-center justify-between py-1 border-b last:border-b-0">
                        <div className="text-sm">
                          <div className="font-medium">{p.name} <span className="text-xs text-slate-400">({genderDesc})</span></div>
                          <div className="text-xs text-slate-400">{p.phone}</div>
                        </div>
                        <div>
                          <button type="button" onClick={() => fillFromOld(p)} className="px-2 py-1 text-sm bg-teal-50 hover:bg-teal-100 rounded transition">填充</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {oldSearchStatus === 'loading' && <div className="mt-2 text-xs text-slate-500">查询中…</div>}
              {oldSearchStatus === 'not-found' && <div className="mt-2 text-xs text-red-500">未找到匹配的患者</div>}
              {oldSearchStatus === 'error' && <div className="mt-2 text-xs text-red-500">查询出错，请查看控制台或网络请求</div>}

              <div className="relative">
                <CreditCard className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  tabIndex={1}
                  className={`w-full pl-10 p-3 border rounded-lg text-sm outline-none transition select-text caret-black ${errors.idCard ? 'border-red-500 bg-red-50' : 'bg-slate-50'}`}
                  placeholder="扫描或输入身份证号"
                  value={formData.idCard}
                  onChange={e => handleIdCardChange(e.target.value)}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.idCard; return c; })}
                  onBlur={handleIdBlur}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {errors.idCard && <div className="text-xs text-red-500 mt-1">{errors.idCard}</div>}
              </div>
            </div>

            {/* 2. 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 relative">
                <input
                  tabIndex={2}
                  className={`w-full p-3 border rounded-lg text-sm transition select-text caret-black ${errors.name ? 'border-red-500 bg-red-50' : (lockedFromId ? 'bg-slate-50' : 'bg-white')}`}
                  placeholder="患者姓名"
                  value={formData.name}
                  onChange={e => !lockedFromId && setFormData({...formData, name: e.target.value})}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.name; return c; })}
                  disabled={lockedFromId}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {(lockedFromId || parsedLocked) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, name: '', age: '', idCard: '', phone: '', gender: '1', insurance: '自费', type: '初诊' }));
                      setLockedFromId(false);
                      setParsedLocked(false);
                      setErrors({});
                      setOldPatients([]);
                      setSearchOld('');
                    }}
                    className="absolute right-2 top-2 px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded transition"
                    title="清空并重新填写"
                  >
                    清空
                  </button>
                )}
                {errors.name && <div className="text-xs text-red-500 mt-1">{errors.name}</div>}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  tabIndex={3}
                  onClick={() => !(parsedLocked || lockedFromId) && setFormData({...formData, gender: '1'})}
                  disabled={parsedLocked || lockedFromId}
                  className={`flex-1 p-3 border rounded-lg text-sm font-medium transition-all ${formData.gender === '1' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'} ${(parsedLocked || lockedFromId) ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  👨 男
                </button>
                <button
                  type="button"
                  tabIndex={4}
                  onClick={() => !(parsedLocked || lockedFromId) && setFormData({...formData, gender: '0'})}
                  disabled={parsedLocked || lockedFromId}
                  className={`flex-1 p-3 border rounded-lg text-sm font-medium transition-all ${formData.gender === '0' ? 'bg-pink-50 border-pink-500 text-pink-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'} ${(parsedLocked || lockedFromId) ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  👩 女
                </button>
              </div>

              <div className="relative">
                <input type="text" readOnly className="w-full p-3 border rounded-lg text-sm bg-slate-100 text-slate-700 cursor-not-allowed" placeholder="年龄" value={formData.age} />
                <span className="absolute right-3 top-3 text-xs text-slate-400">岁</span>
              </div>

              <div className="col-span-2 relative">
                <Phone className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  tabIndex={5}
                  className={`w-full pl-10 p-3 border rounded-lg text-sm transition select-text caret-black ${errors.phone ? 'border-red-500 bg-red-50' : (lockedFromId ? 'bg-slate-50' : 'bg-white')}`}
                  placeholder="手机号码"
                  value={formData.phone}
                  onChange={e => !lockedFromId && setFormData({...formData, phone: e.target.value})}
                  onFocus={() => setErrors(prev => { const c = { ...prev }; delete c.phone; return c; })}
                  disabled={lockedFromId}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {errors.phone && <div className="text-xs text-red-500 mt-1">{errors.phone}</div>}
              </div>

              <div className="col-span-2 relative">
                <ShieldCheck className="absolute left-3 top-3 text-slate-400" size={18} />
                <select tabIndex={6} className="w-full pl-10 p-3 border rounded-lg text-sm bg-white" value={formData.insurance} onChange={e => setFormData({...formData, insurance: e.target.value})}>
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
                {doctorLoadError && (
                  <div className="col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                    无法加载该科室医生，请检查后端或网络。
                  </div>
                )}
                {doctorLoading && (
                  <div className="col-span-2 text-center py-6">
                    <div className="inline-flex items-center gap-3 text-sm text-slate-500">
                      <span className="inline-block w-5 h-5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                      正在加载医生...
                    </div>
                  </div>
                )}
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
                  <div className="col-span-2 text-center text-xs text-slate-400 py-4">
                    {doctorLoadError ? (
                      <div>无法加载该科室医生，请检查后端或网络。</div>
                    ) : (
                      <div>该科室暂无医生</div>
                    )}
                  </div>
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
                    <div className="font-bold text-lg text-slate-900">{p.patientName}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{p.genderDesc || (p.gender === 1 ? '男' : p.gender === 0 ? '女' : '—')} | {p.age}岁</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded text-xs border ${p.insuranceType === '自费' ? 'border-slate-200 text-slate-500' : 'border-blue-200 bg-blue-50 text-blue-600'}`}>
                      {p.insuranceType}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600">{p.deptName}</td>
                  <td className="p-4 text-slate-600">{doctors.find(d => d.id === p.doctorId)?.name || p.doctorName}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      p.status === 0 || p.status === 4 ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' :
                      p.status === 1 ? 'bg-green-50 text-green-700 border border-green-100' :
                      p.status === 2 ? 'bg-gray-50 text-gray-700 border border-gray-100' :
                      p.status === 3 ? 'bg-red-50 text-red-700 border border-red-100' :
                      p.status === 5 ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                      'bg-slate-50 text-slate-700 border border-slate-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        p.status === 0 || p.status === 4 ? 'bg-yellow-500' :
                        p.status === 1 ? 'bg-green-500' :
                        p.status === 2 ? 'bg-gray-500' :
                        p.status === 3 ? 'bg-red-500' :
                        p.status === 5 ? 'bg-purple-500' :
                        'bg-slate-500'
                      }`}></span>
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
    {cancelDialog.visible && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={() => setCancelDialog({ visible: false, reason: '' })}></div>
        <div className="relative w-full max-w-md bg-white p-6 rounded-xl shadow-2xl z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-lg font-bold text-slate-800">确认退号</div>
              <div className="text-xs text-slate-500 mt-1">请输入取消原因（可选）</div>
            </div>
            <button onClick={() => setCancelDialog({ visible: false, reason: '' })} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <textarea
            className="w-full p-3 border rounded-lg text-sm resize-none focus:border-teal-500 outline-none"
            placeholder="取消原因（选填）"
            rows={3}
            value={cancelDialog.reason}
            onChange={e => setCancelDialog(prev => ({ ...prev, reason: e.target.value }))}
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setCancelDialog({ visible: false, reason: '' })}
              className="flex-1 py-2 text-sm border rounded-lg hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={executeCancelRegistration}
              className="flex-1 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              确认退号
            </button>
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
      <div className="fixed top-20 right-6 z-50 animate-slide-in">
        <div className="bg-white border-l-4 border-teal-500 rounded-lg shadow-lg p-4 min-w-75">
          <div className="flex items-start gap-3">
            <div className="shrink-0 text-2xl">
              {refundNotice.message.includes('✅') ? '✅' : refundNotice.message.includes('⚠️') ? '⚠️' : '❌'}
            </div>
            <div className="flex-1">
              <div className="font-medium text-slate-800 mb-1">退号通知</div>
              <div className="text-sm text-slate-600">{refundNotice.message}</div>
            </div>
            <button 
              onClick={() => setRefundNotice({ visible: false, message: '' })}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
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