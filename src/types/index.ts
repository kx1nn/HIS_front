// src/types/index.ts

/**
 * 用户身份信息（用于路由守卫与界面显示）
 */
export interface User {
  role: 'doctor' | 'nurse' | 'admin' | 'pharmacy';
  name: string;
  dept: string;
  userId?: number;
  relatedId?: number;
}

export const GENDER = { Male: 0 as const, Female: 1 as const };
export type Gender = typeof GENDER[keyof typeof GENDER];

/**
 * 医生信息（基础展示与排班数据）
 */
export interface Doctor {
  id: number;
  name: string;
  deptId: number;
  deptName: string;
  title: string;
  isWorking: boolean; // 今日是否排班
  registrationFee?: number;
}

// 科室信息
export interface Department {
  id: number;
  name: string;
}

/**
 * 挂号提交表单 (DTO)
 */
export interface RegistrationDTO {
  patientName: string;
  idCard: string;
  gender: Gender; // 0=男, 1=女
  age: number;
  phone: string;
  deptId: number;
  doctorId: number;
  regFee?: number;
  registrationFee?: number; // 可选别名，兼容后端命名 regFee / registrationFee
  insuranceType: string; // 医保类型
  type: string; // 初诊/复诊
  // 以下为分阶段收费扩展字段（可选）
  paymentMethod?: number; // 1=现金,2=银行卡,3=微信,4=支付宝
  transactionNo?: string; // 第三方支付流水号（可选）
}

/**
 * 挂号列表展示数据 (VO)，继承 DTO 并加入展示字段
 */
export const RegistrationStatus = {
  WAITING: 0,
  COMPLETED: 1, // 已就诊
  CANCELLED: 2,
  REFUNDED: 3,
  PAID_REGISTRATION: 4,
  IN_CONSULTATION: 5
} as const;
export type RegistrationStatusValue = typeof RegistrationStatus[keyof typeof RegistrationStatus];

export interface RegistrationVO extends RegistrationDTO {
  id: number;
  regNo: string;      // 挂号单号 (如 REG2023...)
  mrn: string;        // 病历号 (如 P2023...)
  status: number;     // 使用 RegistrationStatus
  statusDesc: string; // "待诊"
  sequence: number;   // 排队号
  createTime: string;
  patientId?: number;
  registrationFee?: number;
  queueNo?: string;
  visitDate?: string;
  createdAt?: string;
  doctorName?: string; // 方便展示
  deptName?: string;   // 方便展示
  genderDesc?: string; // 性别描述："男"/"女"，从后端直接返回
}

/**
 * 患者基本信息（DB 表映射）
 */
export interface Patient {
  main_id: number; // 主键
  patient_no: string;
  name: string;
  gender: Gender;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  birth_date?: string | null;
  age?: number | null;
  phone?: string | null;
  id_card?: string | null;
  medical_card_no?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  blood_type?: string | null;
  allergy_history?: string | null;
  medical_history?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
  // 可能由后端返回的扩展字段
  mrn?: string | null; // 病历号
  insuranceType?: string | null; // 医保类型文字
}

// his_sysuser
export interface SysUserRecord {
  main_id: number;
  username: string;
  password: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: number;
  is_deleted: number;
  created_at?: string;
  updated_at?: string;
  last_login_time?: string | null;
  role_code: string;
  department_main_id?: number | null;
  related_id?: number | null;
  avatar?: string | null;
  remark?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// sys_audit_log
export interface SysAuditLog {
  /** 主键ID（自增） */
  id: number; // BIGSERIAL PRIMARY KEY

  /** 模块名 (认证管理、挂号管理、处方管理、药房管理、收费管理) */
  module: string;
  /** 操作名 (用户登录、患者挂号、开具处方、发药、收费) */
  action: string;
  /** 审计类型 (SENSITIVE_OPERATION, BUSINESS, DATA_ACCESS) */
  audit_type?: string | null;
  /** 操作描述详情 */
  description?: string | null;

  /** 操作人ID (sys_user.id) */
  operator_id?: number | null;
  /** 操作人用户名 (冗余存储, 便于查询) */
  operator_username?: string | null;

  /** 链路追踪ID (32位十六进制字符串) */
  trace_id?: string | null;
  /** 客户端IP地址 (支持反向代理) */
  request_ip?: string | null;
  /** User-Agent (浏览器、操作系统等信息) */
  user_agent?: string | null;

  /** 执行状态 (SUCCESS, FAILURE) */
  status?: string | null;
  /** 执行时间(毫秒) */
  execution_time?: number | null;

  /** 异常类型 (BusinessException, NullPointerException, etc.) */
  exception_type?: string | null;
  /** 异常消息 (限制1000字符) */
  exception_message?: string | null;

  /** 创建时间 */
  create_time?: string; // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
}

/**
 * 药品信息（基础字段）
 */
// --- 药品数据 ---
export interface Drug {
  id: number;              // main_id
  medicineCode: string;    // medicine_code
  name: string;            // name
  commonName?: string | null;     // generic_name
  spec?: string | null;           // specification
  unit?: string | null;           // unit
  price: string;           // retail_price (retailPrice) - use string to preserve decimal precision
  retailPrice?: string;    // 可选别名，兼容返回字段名 retailPrice

  // 可选的药师专用/可见字段
  purchasePrice?: string | null;  // 进货价（仅药师可见） - DECIMAL(10,4)
  profitMargin?: number | null;   // 利润率（仅药师可见，百分比)

  // 库存字段
  stock: number;           // stock_quantity
  stockQuantity?: number;  // 可选别名，兼容返回字段名 stockQuantity


  minStock?: number | null;       // min_stock（仅药师可见）
  maxStock?: number | null;       // max_stock（仅药师可见）

  manufacturer?: string | null;   // manufacturer
  category?: string | null;       // category (原 type)
  expiryWarningDays?: number | null; // expiry_warning_days
  isPrescription?: number | null; // is_prescription (0/1)
  status?: number | null;       // status (1=启用, 0=停用)
  is_deleted?: number | null;   // 软删除标记

  approvalNo?: string | null; // approval_no
  storageCondition?: string | null; // storage_condition
  version?: number | null;

  batchNumber?: string | null;
  productionDate?: string | null;
  expiryDate?: string | null;

  // UI 辅助状态
  uiStatus?: 'normal' | 'low_stock' | 'expired';
}

// his_doctor
export interface DoctorRecord {
  main_id: number;
  department_main_id: number;
  doctor_no: string;
  name: string;
  gender: Gender;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  title?: string | null;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  license_no?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// his_department
export interface DepartmentRecord {
  main_id: number;
  dept_code: string;
  name: string;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  parent_id?: number | null;
  sort_order?: number | null;
  description?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// his_registration
export interface RegistrationRecord {
  main_id: number;
  patient_main_id: number;
  doctor_main_id: number;
  department_main_id: number;
  reg_no: string;
  visit_date: string;
  visit_type: number;
  registration_fee: string; // DECIMAL(10,2)
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  appointment_time?: string | null;
  queue_no?: string | null;
  cancel_reason?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}



// 药品详情 VO (API 响应)
export interface MedicineVO {
  mainId: number;              // 药品ID
  medicineCode: string;        // 药品编码
  name: string;                // 药品名称
  genericName?: string | null;        // 通用名称
  retailPrice: string;         // 零售价格（DECIMAL(10,4)） - use string to preserve precision
  purchasePrice?: string | null;      // 进货价（仅药师可见） - DECIMAL(10,4)
  profitMargin?: number | null;       // 利润率（仅药师可见，百分比）
  stockQuantity: number;       // 库存数量
  minStock?: number | null;           // 最低库存阈值（仅药师可见）
  maxStock?: number | null;           // 最高库存阈值（仅药师可见）
  status: number;              // 状态（0=停用, 1=启用）
  specification?: string | null;      // 规格
  unit?: string | null;               // 单位
  dosageForm?: string | null;         // 剂型
  manufacturer?: string | null;       // 生产厂家
  category?: string | null;           // 药品分类
  isPrescription: number;      // 是否处方药（0=否, 1=是）
  approvalNo?: string | null; // 批准文号
  storageCondition?: string | null; // 储存条件
  version?: number | null; // 版本号
  batchNumber?: string | null; // 批次号（可选，兼容后端 batchNumber/batch_number）
  productionDate?: string | null; // 生产日期（兼容 productionDate/production_date）
  expiryDate?: string | null; // 过期日期（兼容 expiryDate/expiry_date）
  createdAt?: string;          // 创建时间
  updatedAt?: string;          // 更新时间
}

// his_medical_record
export interface MedicalRecord {
  main_id: number;
  registration_main_id: number;
  patient_main_id: number;
  doctor_main_id: number;
  record_no: string;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  visit_time?: string | null;
  chief_complaint?: string | null;
  present_illness?: string | null;
  past_history?: string | null;
  personal_history?: string | null;
  family_history?: string | null;
  physical_exam?: string | null;
  auxiliary_exam?: string | null;
  diagnosis?: string | null;
  diagnosis_code?: string | null;
  treatment_plan?: string | null;
  doctor_advice?: string | null;
  version?: number | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// 病历详情 VO (API 响应)
export interface MedicalRecordVO {
  mainId: number;
  recordNo: string;
  registrationId: number;
  patientId: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  chiefComplaint: string;
  presentIllness: string;
  pastHistory: string;
  personalHistory: string;
  familyHistory: string;
  physicalExam: string;
  auxiliaryExam: string;
  diagnosis: string;
  diagnosisCode: string;
  treatmentPlan: string;
  doctorAdvice: string;
  status: number;
  visitTime: string;
  createdAt: string;
  updatedAt: string;
}

// 患者详情 VO
export interface PatientDetailVO {
  patientId: number;
  patientNo: string;
  name: string;
  gender: Gender;
  genderDesc: string;
  age: number;
  birthDate: string;
  phone: string;
  idCard: string;
  address: string;
  medicalCardNo: string;
  bloodType: string;
  allergyHistory: string;
  medicalHistory: string;
  emergencyContact: string;
  emergencyPhone: string;
  createdAt: string;
  updatedAt: string;
}

// 病历保存 DTO
export interface MedicalRecordDTO {
  registrationId: number;
  chiefComplaint?: string;
  presentIllness?: string;
  pastHistory?: string;
  personalHistory?: string;
  familyHistory?: string;
  physicalExam?: string;
  auxiliaryExam?: string;
  diagnosis?: string;
  diagnosisCode?: string;
  treatmentPlan?: string;
  doctorAdvice?: string;
  status?: number; // 0=草稿, 1=已提交, 2=已审核
}

// his_prescription
export interface Prescription {
  main_id: number;
  record_main_id: number;
  patient_main_id: number;
  doctor_main_id: number;
  prescription_no: string;
  prescription_type: number;
  total_amount: string; // DECIMAL(10,2)
  item_count: number;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  validity_days?: number | null;
  review_doctor_main_id?: number | null;
  review_time?: string | null;
  review_remark?: string | null;
  dispense_time?: string | null;
  dispense_by?: number | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// his_prescription_detail
export interface PrescriptionDetail {
  main_id: number;
  prescription_main_id: number;
  medicine_main_id: number;
  medicine_name: string;
  unit_price: string; // DECIMAL(10,4)
  quantity: number;
  subtotal: string; // DECIMAL(10,2)
  is_deleted: number;
  created_at: string;
  updated_at: string;

  specification?: string | null;
  unit?: string | null;
  frequency?: string | null;
  dosage?: string | null;
  route?: string | null;
  days?: number | null;
  instructions?: string | null;
  sort_order?: number | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// 前端展示用处方 VO（UI 层）
export interface PrescriptionItemVO {
  drugName: string;
  spec?: string | null;
  count: number;
  usage?: string | null;
  medicineId?: number;
}

export interface PrescriptionVO {
  id: number;
  patientName: string;
  gender: Gender;
  genderDesc?: string; // 性别描述："男"/"女"
  age: number;
  regNo?: string | null;
  totalAmount: string; // DECIMAL(10,2)
  items: PrescriptionItemVO[];
}

// his_charge
export interface Charge {
  main_id: number;
  patient_main_id: number;
  charge_no: string;
  charge_type: number;
  total_amount: string;
  actual_amount: string;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  registration_main_id?: number | null;
  prescription_main_id?: number | null; // 对应处方ID
  discount_amount?: string | null;
  insurance_amount?: string | null;
  payment_method?: number | null;
  transaction_no?: string | null;
  charge_time?: string | null;
  payment_time?: string | null; // 支付时间
  operator_id?: number | null; // 操作员ID
  cashier_main_id?: number | null;
  refund_amount?: string | null;
  refund_time?: string | null;
  refund_reason?: string | null;
  invoice_no?: string | null;
  remark?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// his_charge_detail
export interface ChargeDetail {
  /** 主键ID（自增） */
  main_id: number;
  /** 收费主表ID（fk -> his_charge.main_id） */
  charge_main_id: number;
  /** 项目类型（REGISTRATION=挂号费, PRESCRIPTION=处方药费） */
  item_type: string;
  /** 项目关联ID（挂号ID或处方明细ID） */
  item_id: number;
  /** 项目名称 */
  item_name: string;
  /** 项目金额 DECIMAL(10,2) */
  item_amount: string;
  /** 数量 DECIMAL(10,2) 默认 1 */
  quantity: number;
  /** 单价 DECIMAL(10,4) 可空 */
  unit_price?: string | null;
  /** 备注 VARCHAR(500) 可空 */
  remarks?: string | null;
  /** 软删除标记（0=未删除,1=已删除） */
  is_deleted: number;
  /** 创建时间 */
  created_at: string;
  /** 创建人ID */
  created_by?: number | null;
}

// UI VO
export interface ChargeDetailVO {
  itemType: string;
  itemName: string;
  itemAmount: number;
  // 为了兼容现有 UI，保留可选字段
  id?: number;
  name?: string;
  price?: string | null; // 金额字段使用 string 保持精度
  quantity?: number;
  amount?: number;
  type?: string;
  unitPrice?: string | null; // 单价，匹配 his_charge_detail.unit_price
  remarks?: string | null; // 备注
}

export interface ChargeVO {
  id: number;
  chargeNo: string;
  patientId: number;
  patientName: string;
  totalAmount: string; // DECIMAL(10,2)
  status: RegistrationStatusValue; // 分阶段收费状态（使用 RegistrationStatus 0-5）
  statusDesc: string;
  details: ChargeDetailVO[];
  createdAt: string;
  // 兼容字段
  createTime?: string;
  items?: ChargeDetailVO[];
}

export interface CreateChargeDTO {
  registrationId: number;
  prescriptionIds?: number[];
}

export interface PaymentDTO {
  paymentMethod: number; // 1=现金, 2=银行卡, 3=微信, 4=支付宝, 5=医保
  transactionNo?: string;
  paidAmount: string; // DECIMAL(10,2)
}

export interface RefundRequest {
  refundReason?: string;
}

export interface PaymentBreakdownVO {
  [key: string]: {
    count: number;
    amount: string; // DECIMAL as string
  };
}

export interface RefundStatsVO {
  count: number;
  amount: string; // DECIMAL as string
}

export interface DailySettlementVO {
  date: string;
  cashierName: string;
  totalCharges: number;
  totalAmount: string; // DECIMAL as string
  paymentBreakdown: PaymentBreakdownVO;
  refunds: RefundStatsVO;
  netCollection: string; // DECIMAL as string
}

export interface PageChargeVO {
  content: ChargeVO[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

// 处方明细视图对象（用于API响应）
export interface PrescriptionDetailVO {
  mainId: number; // 明细ID
  medicineId: number; // 药品ID
  medicineName: string; // 药品名称
  unitPrice: number; // 单价
  quantity: number; // 数量
  subtotal: number; // 小计
  frequency?: string; // 用药频率
  dosage?: string; // 用量
  route?: string; // 用药途径
  days?: number; // 用药天数
  instructions?: string; // 用药说明
}

// 库存统计视图对象
export interface InventoryStatsVO {
  totalMedicines: number; // 药品总数量
  inStockCount: number; // 正常库存药品数量
  lowStockCount: number; // 低库存药品数量
  outOfStockCount: number; // 缺货药品数量
  outOfStockRate: number; // 缺货占比（%）
  lowStockRate: number; // 低库存占比（%）
  inStockRate: number; // 正常库存占比（%）
}

// 药师今日统计DTO
export interface PharmacistStatisticsDTO {
  dispensedCount: number; // 今日发药单数
  totalAmount: number; // 今日发药总金额
  totalItems: number; // 今日发药药品总数
}

// 审计日志实体
export interface AuditLogEntity {
  id: number; // 审计日志ID
  module: string; // 模块名称（如：认证管理、挂号管理）
  action: string; // 操作描述（如：用户登录、患者挂号）
  auditType: string; // 审计类型（SENSITIVE_OPERATION、BUSINESS、DATA_ACCESS）
  description: string; // 操作详细描述
  operatorId: number; // 操作人ID（sys_user.id）
  operatorUsername: string; // 操作人用户名
  traceId: string; // 链路追踪ID（32位十六进制字符串）
  requestIp: string; // 请求IP地址
  userAgent: string; // 浏览器User-Agent
  status: string; // 执行状态（SUCCESS、FAILURE等）
  executionTime: number; // 执行耗时（毫秒）
  exceptionType?: string; // 异常类型（失败时）
  exceptionMessage?: string; // 异常消息（失败时）
  createTime: string; // 创建时间（ISO格式）
}

// 审计日志分页对象
export interface PageAuditLogEntity {
  totalElements: number; // 总记录数
  totalPages: number; // 总页数
  first: boolean; // 是否第一页
  last: boolean; // 是否最后一页
  size: number; // 每页大小
  content: AuditLogEntity[]; // 审计日志列表
  number: number; // 当前页码（从0开始）
  numberOfElements: number; // 当前页元素数量
  empty: boolean; // 是否为空
}
