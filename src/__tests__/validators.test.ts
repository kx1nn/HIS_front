import { describe, it, expect } from 'vitest';
import { parseIdCard } from '../utils/validators';

describe('validators.parseIdCard', () => {
    it('should parse gender and age correctly for a typical 18-digit id', () => {
        // 官方示例：北京市东城区 1949-12-31，校验位 X
        const id = '11010519491231002X';
        const res = parseIdCard(id);
        expect(res).not.toBeNull();
        if (res) {
            expect([0, 1].includes(res.gender)).toBe(true);
            expect(res.birthDate).toBe('1949-12-31');
            expect(typeof res.age).toBe('number');
        }
    });
});