import { validateIdCard, validatePhone, validateName, validateAge, parseIdCard } from '../utils/validators';

describe('validators', () => {
    test('validateIdCard valid and invalid', () => {
        // valid sample (use a fabricated but checksum-correct id if possible)
        const valid = '11010519491231002X';
        expect(validateIdCard(valid).valid).toBe(true);
        expect(validateIdCard('').valid).toBe(false);

        const invalid = '123';
        expect(validateIdCard(invalid).valid).toBe(false);
    });

    test('validatePhone', () => {
        expect(validatePhone('13800138000').valid).toBe(true);
        expect(validatePhone('1234').valid).toBe(false);
    });

    test('validateName', () => {
        expect(validateName('张三').valid).toBe(true);
        expect(validateName('x').valid).toBe(false);
    });

    test('validateAge', () => {
        expect(validateAge(30).valid).toBe(true);
        expect(validateAge('abc').valid).toBe(false);
        expect(validateAge(200).valid).toBe(false);
    });

    test('parseIdCard extracts info', () => {
        // 11010519491231002X -> birth 1949-12-31, gender from 17th digit
        const res = parseIdCard('11010519491231002X');
        expect(res).not.toBeNull();
        if (res) {
            expect(res.birthDate).toBe('1949-12-31');
            expect(typeof res.age).toBe('number');
            expect(res.gender === 0 || res.gender === 1).toBe(true);
        }
    });
});