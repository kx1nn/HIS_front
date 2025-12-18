// src/types/index.ts

// 用户身份信息
export interface User {
  role: 'doctor' | 'nurse' | 'admin' | 'pharmacy';
  name: string;
  dept: string;
}

// 医生信息
export interface Doctor {
  id: number;
  name: string;
  deptId: number;
  deptName: string;
  title: string;
  isWorking: boolean; // 今日是否排班
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
  doctorName?: string; // 方便展示
  deptName?: string;   // 方便展示
}