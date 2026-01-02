// src/types/index.ts

// 用户身份信息
export interface User {
  role: 'doctor' | 'nurse' | 'admin' | 'pharmacy';
  name: string;
  dept: string;
  userId?: number;
  relatedId?: number;
}

// 医生信息
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

// 挂号提交表单 (DTO)
export interface RegistrationDTO {
  patientName: string;
  idCard: string;
  gender: number; // 0:女, 1:男
  age: number;
  phone: string;
  deptId: number;
  doctorId: number;
  regFee: number;
  insuranceType: string; // 医保类型
  type: string; // 初诊/复诊
}

// 挂号列表展示数据 (VO)
export interface RegistrationVO extends RegistrationDTO {
  id: number;
  regNo: string;      // 挂号单号 (如 REG2023...)
  mrn: string;        // 病历号 (如 P2023...)
  status: number;     // 0:待诊, 1:诊中, 2:已诊
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
}

export interface Patient {
  main_id: number; // 主键
  patient_no: string;
  name: string;
  gender: number;
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

// his_doctor
export interface DoctorRecord {
  main_id: number;
  department_main_id: number;
  doctor_no: string;
  name: string;
  gender: number;
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
  registration_fee: number;
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

// --- 药品数据 ---
export interface Drug {
  id: number;              // main_id
  medicineCode: string;    // medicine_code
  name: string;            // name
  commonName?: string;     // generic_name
  spec: string;            // specification
  unit: string;            // unit
  price: number;           // retail_price
  stock: number;           // stock_quantity
  manufacturer: string;    // manufacturer
  category: string;        // category (原 type)
  minStock: number;        // min_stock
  expiryWarningDays: number; // expiry_warning_days
  isPrescription: number;  // is_prescription (0/1)
  dbStatus: number;        // status (1=启用, 0=停用)

  batchNumber?: string;
  productionDate?: string;
  expiryDate?: string;

  // UI 辅助状态
  uiStatus?: 'normal' | 'low_stock' | 'expired';
}

// 药品详情 VO (API 响应)
export interface MedicineVO {
  mainId: number;              // 药品ID
  medicineCode: string;        // 药品编码
  name: string;                // 药品名称
  genericName?: string;        // 通用名称
  retailPrice: number;         // 零售价格
  stockQuantity: number;       // 库存数量
  status: number;              // 状态（0=停用, 1=启用）
  specification?: string;      // 规格
  unit?: string;               // 单位
  dosageForm?: string;         // 剂型
  manufacturer?: string;       // 生产厂家
  category?: string;           // 药品分类
  isPrescription: number;      // 是否处方药（0=否, 1=是）
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
  gender: number;
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
  total_amount: number;
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
  unit_price: number;
  quantity: number;
  subtotal: number;
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
  gender: number;
  age: number;
  regNo?: string | null;
  totalAmount: number;
  items: PrescriptionItemVO[];
}

// his_charge
export interface Charge {
  main_id: number;
  patient_main_id: number;
  charge_no: string;
  charge_type: number;
  total_amount: number;
  actual_amount: number;
  status: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;

  registration_main_id?: number | null;
  discount_amount?: number | null;
  insurance_amount?: number | null;
  payment_method?: number | null;
  transaction_no?: string | null;
  charge_time?: string | null;
  cashier_main_id?: number | null;
  refund_amount?: number | null;
  refund_time?: string | null;
  refund_reason?: string | null;
  invoice_no?: string | null;
  remark?: string | null;
  created_by?: number | null;
  updated_by?: number | null;
}

// his_charge_detail
export interface ChargeDetail {
  main_id: number;
  charge_main_id: number;
  item_type: number; // 1: Drug, 2: Service, 3: Registration
  item_id: number;
  item_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

// UI VO
export interface ChargeDetailVO {
  itemType: string;
  itemName: string;
  itemAmount: number;
  // 为了兼容现有 UI，保留可选字段
  id?: number;
  name?: string;
  price?: number;
  quantity?: number;
  amount?: number;
  type?: string;
}

export interface ChargeVO {
  id: number;
  chargeNo: string;
  patientId: number;
  patientName: string;
  totalAmount: number;
  status: number; // 0: Unpaid, 1: Paid, 2: Refunded
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
  paidAmount: number;
}

export interface RefundRequest {
  refundReason?: string;
}

export interface PaymentBreakdownVO {
  [key: string]: {
    count: number;
    amount: number;
  };
}

export interface RefundStatsVO {
  count: number;
  amount: number;
}

export interface DailySettlementVO {
  date: string;
  cashierName: string;
  totalCharges: number;
  totalAmount: number;
  paymentBreakdown: PaymentBreakdownVO;
  refunds: RefundStatsVO;
  netCollection: number;
}

export interface PageChargeVO {
  content: ChargeVO[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}
