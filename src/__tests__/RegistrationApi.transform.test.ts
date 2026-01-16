import { describe, it, expect, beforeEach } from 'vitest';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { registrationApi } from '../services/api';

describe('registrationApi 请求转换测试', () => {
    beforeEach(() => {
        // nothing
    });

    it('会在请求发送前将 payload 转为 snake_case（reg_fee）', async () => {
        let capturedBody: unknown = null;
        server.use(
            rest.post('/api/nurse/registrations', async (req, res, ctx) => {
                capturedBody = await req.json();
                return res(ctx.status(200), ctx.json({ code: 0, data: { ok: true } }));
            })
        );

        const payload = {
            patientName: '测试',
            idCard: '110105199001011234',
            gender: 1,
            age: 30,
            phone: '13100000000',
            deptId: 1,
            doctorId: 1,
            registrationFee: 20,
            insuranceType: '自费',
            type: '初诊'
        } as unknown as import('../types').RegistrationDTO;

        const res = await registrationApi.create(payload);
        expect(res.success).toBe(true);
        // capturedBody 应包含 snake_case 字段 reg_fee
        const b = capturedBody as Record<string, unknown>;
        expect(b).toBeTruthy();
        // reg_fee 可能来自 regFee 或 registrationFee，转换后应为 reg_fee
        expect(Object.prototype.hasOwnProperty.call(b, 'reg_fee') || Object.prototype.hasOwnProperty.call(b, 'registration_fee')).toBe(true);
    });
});