// src/services/api.ts
import axios from 'axios';
import type { RegistrationDTO, RegistrationVO } from '../types';

// 配置 API 基础地址 (如果有真实后端，改为 http://localhost:8080)
const API_BASE_URL = ''; 

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

// --- 内存数据库 (模拟后端存储) ---
let mockIdCounter = 1;
let mockRegistrations: RegistrationVO[] = [
  {
    id: 999,
    regNo: 'REG20231217001',
    mrn: 'P20230001',
    patientName: '张伟',
    idCard: '110101199001011234',
    gender: 1,
    age: 32,
    phone: '13800138000',
    deptId: 1,
    deptName: '内科',
    doctorId: 101,
    doctorName: '王医生',
    regFee: 20,
    insuranceType: '职工医保',
    type: '初诊',
    status: 0,
    statusDesc: '待诊',
    sequence: 1,
    createTime: '08:30:00'
  }
];

// --- 模拟历史患者库 (用于身份证自动识别) ---
const MOCK_PATIENT_DB = [
  { idCard: '110101199001011234', name: '张伟', gender: 1, age: 33, phone: '13800138000', insuranceType: '职工医保', mrn: 'P20230001' }
];

export const registrationApi = {
  // 1. 提交挂号接口
  create: async (data: RegistrationDTO): Promise<{ success: boolean; data?: RegistrationVO; message?: string }> => {
    console.log('正在请求挂号接口...', data);
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      // 生成模拟数据
      const newReg: RegistrationVO = {
        ...data,
        id: Date.now(),
        regNo: `REG${new Date().toISOString().slice(0,10).replace(/-/g,'')}${mockIdCounter}`,
        mrn: data.idCard === '110101199001011234' ? 'P20230001' : `P${Date.now()}`, // 模拟老患识别
        status: 0,
        statusDesc: '待诊',
        sequence: ++mockIdCounter,
        createTime: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        // 简单补全名称，实际后端会查库
        deptName: data.deptId === 1 ? '内科' : '其他科室', 
        doctorName: '医生' 
      };
      
      // 存入内存
      mockRegistrations = [newReg, ...mockRegistrations];
      
      return { success: true, data: newReg };
    } catch {
      return { success: false, message: '服务器繁忙' };
    }
  },

  // 2. 获取今日挂号列表
  getList: async (): Promise<RegistrationVO[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return [...mockRegistrations];
  },

  // 3. 根据身份证查询老患者 (模拟)
  checkPatient: async (idCard: string) => {
    // 模拟API查询
    await new Promise(resolve => setTimeout(resolve, 200));
    return MOCK_PATIENT_DB.find(p => p.idCard === idCard);
  }
};