// src/utils/validators.ts
// 通用验证工具函数

/**
 * 验证18位身份证号码（含校验位）
 * @param id 身份证号码（18位）
 * @returns 验证结果对象：{ valid: boolean; message?: string }
 */
export function validateIdCard(id: string): { valid: boolean; message?: string } {
    if (!id || typeof id !== 'string') {
        return { valid: false, message: '请输入身份证号' };
    }

    const trimmed = id.trim().toUpperCase();

    if (trimmed.length !== 18) {
        return { valid: false, message: '身份证号必须为18位' };
    }

    // 基本格式检查
    if (!/^\d{17}[\dX]$/.test(trimmed)) {
        return { valid: false, message: '身份证号格式不正确' };
    }

    // 校验位验证
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = '10X98765432';

    let sum = 0;
    for (let i = 0; i < 17; i++) {
        sum += parseInt(trimmed[i], 10) * weights[i];
    }

    const expectedCheckCode = checkCodes[sum % 11];
    if (trimmed[17] !== expectedCheckCode) {
        return { valid: false, message: '身份证号校验位错误' };
    }

    // 验证出生日期是否有效
    const birthStr = trimmed.substring(6, 14);
    const year = parseInt(birthStr.substring(0, 4), 10);
    const month = parseInt(birthStr.substring(4, 6), 10);
    const day = parseInt(birthStr.substring(6, 8), 10);

    const birthDate = new Date(year, month - 1, day);
    if (
        birthDate.getFullYear() !== year ||
        birthDate.getMonth() !== month - 1 ||
        birthDate.getDate() !== day
    ) {
        return { valid: false, message: '身份证号出生日期无效' };
    }

    // 检查出生日期是否合理（不能是未来日期，不能太早）
    const now = new Date();
    if (birthDate > now) {
        return { valid: false, message: '出生日期不能是未来日期' };
    }

    const minYear = now.getFullYear() - 150;
    if (year < minYear) {
        return { valid: false, message: '出生日期不合理' };
    }

    return { valid: true };
}

/**
 * 验证手机号码
 * @param phone 手机号字符串
 * @returns 验证结果对象：{ valid: boolean; message?: string }
 */
export function validatePhone(phone: string): { valid: boolean; message?: string } {
    if (!phone || typeof phone !== 'string') {
        return { valid: false, message: '请输入手机号码' };
    }

    const trimmed = phone.trim();

    // 中国大陆手机号：1开头，第二位3-9，共11位
    if (!/^1[3-9]\d{9}$/.test(trimmed)) {
        return { valid: false, message: '请输入有效的11位手机号码' };
    }

    return { valid: true };
}

/**
 * 验证姓名
 * @param name 姓名字符串
 * @returns 验证结果对象：{ valid: boolean; message?: string }
 */
export function validateName(name: string): { valid: boolean; message?: string } {
    if (!name || typeof name !== 'string') {
        return { valid: false, message: '请输入姓名' };
    }

    const trimmed = name.trim();

    if (trimmed.length < 2) {
        return { valid: false, message: '姓名至少2个字符' };
    }

    if (trimmed.length > 30) {
        return { valid: false, message: '姓名不能超过30个字符' };
    }

    // 只允许中文、英文字母、空格和点
    if (!/^[\u4e00-\u9fa5a-zA-Z\s·.]+$/.test(trimmed)) {
        return { valid: false, message: '姓名只能包含中文、英文字母' };
    }

    return { valid: true };
}

/**
 * 验证年龄
 * @param age 年龄数字或字符串
 * @returns 验证结果对象：{ valid: boolean; message?: string }
 */
export function validateAge(age: number | string): { valid: boolean; message?: string } {
    const ageNum = typeof age === 'string' ? parseInt(age, 10) : age;

    if (isNaN(ageNum)) {
        return { valid: false, message: '请输入有效年龄' };
    }

    if (ageNum < 0) {
        return { valid: false, message: '年龄不能为负数' };
    }

    if (ageNum > 150) {
        return { valid: false, message: '年龄不能超过150岁' };
    }

    return { valid: true };
}

/**
 * 从身份证号提取信息
 * @param id 身份证号码（18位）
 * @returns 返回提取的信息对象或 null，格式：{ gender: 1|0, birthDate: 'YYYY-MM-DD', age: number }
 */
export function parseIdCard(id: string): {
    gender: number; // 1: 男, 0: 女
    birthDate: string; // YYYY-MM-DD
    age: number;
} | null {
    const validation = validateIdCard(id);
    if (!validation.valid) {
        return null;
    }

    const trimmed = id.trim().toUpperCase();

    // 提取出生日期
    const birthStr = trimmed.substring(6, 14);
    const year = parseInt(birthStr.substring(0, 4), 10);
    const month = parseInt(birthStr.substring(4, 6), 10);
    const day = parseInt(birthStr.substring(6, 8), 10);
    const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 计算年龄
    const today = new Date();
    let age = today.getFullYear() - year;
    const monthDiff = today.getMonth() + 1 - month;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
        age--;
    }

    // 提取性别（第17位，奇数为男，偶数为女）
    const genderCode = parseInt(trimmed[16], 10);
    const gender = genderCode % 2 === 1 ? 1 : 0;

    return { gender, birthDate, age };
}

export default {
    validateIdCard,
    validatePhone,
    validateName,
    validateAge,
    parseIdCard,
};
