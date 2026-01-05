import * as msw from 'msw';
import { rest } from 'msw';
import type { RestRequest, RestContext, ResponseComposition } from 'msw';

// 兼容：如果 msw 导出 http（v2），使用 http；否则回退到 rest（v1）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const http: any = (msw as any).http ?? (msw as any).rest;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isHttp = Boolean((msw as any).http);

const RegistrationStatus = {
    WAITING: 0,
    COMPLETED: 1,
    CANCELLED: 2,
    REFUNDED: 3,
    PAID_REGISTRATION: 4,
    IN_CONSULTATION: 5
} as const;

// 简单的内存存储，模拟后端收费单数据
type MockCharge = {
    id: number;
    chargeNo: string;
    patientName: string;
    totalAmount: string; // DECIMAL as string
    status: number;
    statusDesc: string;
    createdAt: string;
    details: Array<{ itemName: string; itemType: string; itemAmount: string }>;
    registrationId?: number;
};
let charges: MockCharge[] = [
    {
        id: 1,
        chargeNo: 'C001',
        patientName: '张三',
        totalAmount: '100.00',
        status: RegistrationStatus.WAITING,
        statusDesc: '待就诊',
        createdAt: '2025-01-01 12:00:00',
        details: [
            { itemName: '挂号费', itemType: 'REGISTRATION', itemAmount: '100.00' }
        ],
        registrationId: 100
    }
];

// 挂号列表的 Mock 数据（可在 __resetMockData 中 reset）
const departmentsMock = [
    {
        id: 1,
        code: 'DEP001',
        name: '内科',
        parentId: 0,
        parentName: '门诊',
        timestamp: 1700000000000
    }
];

const doctorsMock = [
    {
        id: 101,
        doctorNo: 'DR101',
        name: '王医生',
        gender: 1,
        genderText: '男',
        title: '主任医师',
        specialty: '内科',
        status: 1,
        statusText: '启用',
        departmentId: 1,
        departmentName: '内科',
        registrationFee: 10
    }
];

let registrations: Array<Record<string, unknown>> = [
    {
        id: 100,
        reg_no: 'REG100',
        patient_name: '李四',
        id_card: '110105199001011234',
        phone: '13100000001',
        gender: 1,
        status: RegistrationStatus.WAITING,
        status_desc: '待诊',
        sequence: 5,
        dept_name: '内科',
        doctor_name: '王医生',
        insurance_type: '自费'
    },
    {
        id: 200,
        reg_no: 'REG200',
        patient_name: '王五',
        id_card: '110105199001011235',
        phone: '13100000002',
        gender: 1,
        status: RegistrationStatus.PAID_REGISTRATION,
        status_desc: '已缴挂号费',
        sequence: 6,
        dept_name: '内科',
        doctor_name: '王医生',
        insurance_type: '自费'
    }
];

type MockMedicine = {
    mainId: number;
    medicineCode: string;
    name: string;
    genericName?: string;
    retailPrice: string; // DECIMAL as string
    purchasePrice?: string;
    profitMargin?: number;
    stockQuantity: number;
    minStock: number;
    maxStock: number;
    status: number;
    specification?: string;
    unit?: string;
    dosageForm?: string;
    manufacturer?: string;
    category?: string;
    isPrescription?: number;
};

const handlers: unknown[] = [

    // GET 列表
    isHttp
        ? http.get('/api/cashier/charges', () => {
            return new Response(JSON.stringify({ code: 0, data: { content: charges, total: charges.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/cashier/charges', (_req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            return res(ctx.status(200), ctx.json({ code: 0, data: { content: charges, total: charges.length } }));
        }),

    // POST 支付
    isHttp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? http.post('/api/cashier/charges/:id/pay', async (req: any) => {
            const { id } = req.params;
            const nid = Number(id);
            const idx = charges.findIndex((c) => c.id === nid);
            if (idx === -1) {
                return new Response(JSON.stringify({ code: 404, message: '未找到收费单' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }

            // 简单模拟：将状态改为已缴挂号费
            charges[idx] = {
                ...charges[idx],
                status: RegistrationStatus.PAID_REGISTRATION,
                statusDesc: '已缴挂号费'
            };

            return new Response(JSON.stringify({ code: 0, data: charges[idx] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.post('/api/cashier/charges/:id/pay', async (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const id = Number(req.params.id as string);
            const idx = charges.findIndex((c) => c.id === id);
            if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '未找到收费单' }));
            charges[idx] = { ...charges[idx], status: RegistrationStatus.PAID_REGISTRATION, statusDesc: '已缴挂号费' };
            return res(ctx.status(200), ctx.json({ code: 0, data: charges[idx] }));
        }),

    // POST 退费
    isHttp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (http as any).post('/api/cashier/charges/:id/refund', async (req: any) => {
            const params = req?.params ?? {};
            const id = Number(params.id);
            const idx = charges.findIndex((c) => c.id === id);
            if (idx === -1) {
                return new Response(JSON.stringify({ code: 404, message: '未找到收费单' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }

            charges[idx] = {
                ...charges[idx],
                status: RegistrationStatus.REFUNDED,
                statusDesc: '已退费'
            };

            return new Response(JSON.stringify({ code: 0, data: charges[idx] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.post('/api/cashier/charges/:id/refund', async (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const id = Number(req.params.id as string);
            const idx = charges.findIndex((c) => c.id === id);
            if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '未找到收费单' }));
            charges[idx] = { ...charges[idx], status: RegistrationStatus.REFUNDED, statusDesc: '已退费' };
            return res(ctx.status(200), ctx.json({ code: 0, data: charges[idx] }));
        }),

    // 为挂号单创建挂号收费单（仅挂号费）
    isHttp
        ? (http as { post: (path: string, handler: (req: { params: { id: string } }) => Promise<Response>) => void }).post('/api/cashier/charges/registration/:id', async (req: { params: { id: string } }) => {
            const { id } = req.params;
            const regId = Number(id);
            const newId = charges.length + 1;
            const newCharge = {
                id: newId,
                chargeNo: `C${String(newId).padStart(3, '0')}`,
                patientName: `患者${regId}`,
                totalAmount: '20.00',
                status: RegistrationStatus.WAITING,
                statusDesc: '待就诊',
                createdAt: new Date().toISOString(),
                details: [{ itemName: '挂号费', itemType: 'REGISTRATION', itemAmount: '20.00' }],
                registrationId: regId
            };
            charges.push(newCharge);
            return new Response(JSON.stringify({ code: 0, data: newCharge }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.post('/api/cashier/charges/registration/:id', async (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const regId = Number(req.params.id as string);
            const newId = charges.length + 1;
            const newCharge = {
                id: newId,
                chargeNo: `C${String(newId).padStart(3, '0')}`,
                patientName: `患者${regId}`,
                totalAmount: '20.00',
                status: RegistrationStatus.WAITING,
                statusDesc: '待就诊',
                createdAt: new Date().toISOString(),
                details: [{ itemName: '挂号费', itemType: 'REGISTRATION', itemAmount: '20.00' }],
                registrationId: regId
            };
            charges.push(newCharge);
            return res(ctx.status(200), ctx.json({ code: 0, data: newCharge }));
        }),

    // 获取挂号单相关的收费记录（按类型分组）
    isHttp
        ? (http as { get: (path: string, handler: (req: { params: { id: string } }) => Promise<Response>) => void }).get('/api/cashier/charges/registration/:id/by-type', async (req: { params: { id: string } }) => {
            const regId = Number(req.params.id);
            const regList = charges.filter(c => c.registrationId === regId && (c.details || []).some(d => d.itemType === 'REGISTRATION'));
            const prescList = charges.filter(c => c.registrationId === regId && (c.details || []).some(d => d.itemType === 'PRESCRIPTION'));
            return new Response(JSON.stringify({ code: 0, data: { registration: regList, prescription: prescList, combined: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/cashier/charges/registration/:id/by-type', async (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const regId = Number(req.params.id as string);
            const regList = charges.filter(c => c.registrationId === regId && (c.details || []).some(d => d.itemType === 'REGISTRATION'));
            const prescList = charges.filter(c => c.registrationId === regId && (c.details || []).some(d => d.itemType === 'PRESCRIPTION'));
            return res(ctx.status(200), ctx.json({ code: 0, data: { registration: regList, prescription: prescList, combined: [] } }));
        }),

    // 检查挂号费是否已支付
    isHttp
        ? (http as { get: (path: string, handler: (req: { params: { id: string } }) => Promise<Response>) => void }).get('/api/cashier/charges/registration/:id/payment-status', async (req: { params: { id: string } }) => {
            const regId = Number(req.params.id);
            const paid = charges.some(c => c.registrationId === regId && c.status === RegistrationStatus.PAID_REGISTRATION);
            return new Response(JSON.stringify({ code: 0, data: paid }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/cashier/charges/registration/:id/payment-status', async (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const regId = Number(req.params.id as string);
            const paid = charges.some(c => c.registrationId === regId && c.status === RegistrationStatus.PAID_REGISTRATION);
            return res(ctx.status(200), ctx.json({ code: 0, data: paid }));
        }),

    // ------------------------- 药品与处方公共接口（模拟后端迁移） -------------------------

    // GET /api/common/medicines
    isHttp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (http as any).get('/api/common/medicines', (req: any) => {
            const urlStr = req.url;
            const url = new URL(urlStr, 'http://localhost');
            const keyword = url.searchParams.get('keyword') || '';
            const stockStatus = url.searchParams.get('stockStatus') || '';
            const headers = req.headers;
            const role = headers?.['x-user-role'] || 'NURSE';

            const allMedicines: MockMedicine[] = [
                {
                    mainId: 1,
                    medicineCode: 'M001',
                    name: '阿莫西林',
                    genericName: '阿莫西林',
                    retailPrice: '10.5000',
                    purchasePrice: '6.0000',
                    profitMargin: 42.86,
                    stockQuantity: 100,
                    minStock: 10,
                    maxStock: 1000,
                    status: 1,
                    specification: '0.5g',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '抗生素',
                    isPrescription: 1
                },
                {
                    mainId: 2,
                    medicineCode: 'M002',
                    name: '布洛芬',
                    genericName: '布洛芬',
                    retailPrice: '8.0000',
                    purchasePrice: '4.0000',
                    profitMargin: 50.0,
                    stockQuantity: 5,
                    minStock: 10,
                    maxStock: 500,
                    status: 1,
                    specification: '200mg',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '解热镇痛',
                    isPrescription: 0
                }
            ];

            let filtered = allMedicines.filter((m) => m.name.includes(keyword) || (m.genericName || '').includes(keyword));
            if (stockStatus === 'LOW') filtered = filtered.filter((m) => m.stockQuantity <= m.minStock);

            const result = filtered.map((m) => {
                if ((role || '').toLowerCase() === 'pharmacy') return m;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { purchasePrice: _purchasePrice, profitMargin: _profitMargin, minStock: _minStock, maxStock: _maxStock, ...rest } = m;
                return rest;
            });

            return new Response(JSON.stringify({ code: 0, data: { content: result, total: result.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/common/medicines', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const keyword = req.url.searchParams.get('keyword') || '';
            const stockStatus = req.url.searchParams.get('stockStatus') || '';
            const role = req.headers.get('x-user-role') || 'NURSE';

            const allMedicines: MockMedicine[] = [
                {
                    mainId: 1,
                    medicineCode: 'M001',
                    name: '阿莫西林',
                    genericName: '阿莫西林',
                    retailPrice: '10.5000',
                    purchasePrice: '6.0000',
                    profitMargin: 42.86,
                    stockQuantity: 100,
                    minStock: 10,
                    maxStock: 1000,
                    status: 1,
                    specification: '0.5g',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '抗生素',
                    isPrescription: 1
                },
                {
                    mainId: 2,
                    medicineCode: 'M002',
                    name: '布洛芬',
                    genericName: '布洛芬',
                    retailPrice: '8.0000',
                    purchasePrice: '4.0000',
                    profitMargin: 50.0,
                    stockQuantity: 5,
                    minStock: 10,
                    maxStock: 500,
                    status: 1,
                    specification: '200mg',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '解热镇痛',
                    isPrescription: 0
                }
            ];

            let filtered = allMedicines.filter((m) => m.name.includes(keyword) || (m.genericName || '').includes(keyword));
            if (stockStatus === 'LOW') filtered = filtered.filter((m) => m.stockQuantity <= m.minStock);

            const result = filtered.map((m) => {
                if ((role || '').toLowerCase() === 'pharmacy') return m;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { purchasePrice: _purchasePrice, profitMargin: _profitMargin, minStock: _minStock, maxStock: _maxStock, ...rest } = m;
                return rest;
            });

            return res(ctx.status(200), ctx.json({ code: 0, data: { content: result, total: result.length } }));
        }),



    // POST /api/nurse/registrations/today - 返回 snake_case 示例以验证前端自动 camelize
    rest.post('/api/nurse/registrations/today', (_req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        return res(ctx.status(200), ctx.json({ code: 0, data: registrations }));
    }),

    // GET /api/common/medicines/:id
    isHttp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (http as any).get('/api/common/medicines/:id', (req: any) => {
            const params = req?.params ?? {};
            const id = Number(params.id);
            const headers = req?.headers;
            const role = headers?.['x-user-role'] || 'NURSE';
            const m = [
                {
                    mainId: 1,
                    medicineCode: 'M001',
                    name: '阿莫西林',
                    genericName: '阿莫西林',
                    retailPrice: '10.5000',
                    purchasePrice: '6.0000',
                    profitMargin: 42.86,
                    stockQuantity: 100,
                    minStock: 10,
                    maxStock: 1000,
                    status: 1,
                    specification: '0.5g',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '抗生素',
                    isPrescription: 1
                }
            ].find(x => x.mainId === id);
            if (!m) return new Response(JSON.stringify({ code: 404, message: '未找到药品' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            if ((role || '').toLowerCase() !== 'pharmacy') {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { purchasePrice: _purchasePrice, profitMargin: _profitMargin, minStock: _minStock, maxStock: _maxStock, ...rest } = m;
                return new Response(JSON.stringify({ code: 0, data: rest }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ code: 0, data: m }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/common/medicines/:id', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const id = Number(req.params.id as string);
            const role = req.headers.get('x-user-role') || 'NURSE';
            const m = [
                {
                    mainId: 1,
                    medicineCode: 'M001',
                    name: '阿莫西林',
                    genericName: '阿莫西林',
                    retailPrice: '10.5000',
                    purchasePrice: '6.0000',
                    profitMargin: 42.86,
                    stockQuantity: 100,
                    minStock: 10,
                    maxStock: 1000,
                    status: 1,
                    specification: '0.5g',
                    unit: '盒',
                    dosageForm: '片剂',
                    manufacturer: '某药厂',
                    category: '抗生素',
                    isPrescription: 1
                }
            ].find(x => x.mainId === id);
            if (!m) return res(ctx.status(404), ctx.json({ code: 404, message: '未找到药品' }));
            if (role !== 'PHARMACY') {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { purchasePrice: _purchasePrice, profitMargin: _profitMargin, minStock: _minStock, maxStock: _maxStock, ...rest } = m;
                return res(ctx.status(200), ctx.json({ code: 0, data: rest }));
            }
            return res(ctx.status(200), ctx.json({ code: 0, data: m }));
        }),

    // GET /api/common/data/departments
    isHttp
        ? http.get('/api/common/data/departments', () => {
            return new Response(JSON.stringify({ code: 0, data: departmentsMock }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/common/data/departments', (_req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            return res(ctx.status(200), ctx.json({ code: 0, data: departmentsMock }));
        }),

    // GET /api/common/data/doctors
    isHttp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? http.get('/api/common/data/doctors', (req: any) => {
            const raw = req?.url?.searchParams?.get('deptId');
            const deptId = Number(raw);
            const payload = Number.isNaN(deptId)
                ? doctorsMock
                : doctorsMock.filter((d) => d.departmentId === deptId);
            return new Response(JSON.stringify({ code: 0, data: payload }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : rest.get('/api/common/data/doctors', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
            const raw = req.url.searchParams.get('deptId');
            const deptId = raw !== null ? Number(raw) : NaN;
            const payload = Number.isNaN(deptId)
                ? doctorsMock
                : doctorsMock.filter((d) => d.departmentId === deptId);
            return res(ctx.status(200), ctx.json({ code: 0, data: payload }));
        }),

    // PUT /api/registrations/:id/cancel - 取消挂号
    rest.put('/api/registrations/:id/cancel', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        const id = Number(req.params.id as string);
        const idx = registrations.findIndex(r => r.id === id);
        if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '挂号单未找到' }));
        registrations[idx] = { ...registrations[idx], status: 2, status_desc: '已取消' };
        return res(ctx.status(200), ctx.json({ code: 200, data: {} }));
    }),

    // PUT /api/registrations/:id/refund - 挂号退费
    rest.put('/api/registrations/:id/refund', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        const id = Number(req.params.id as string);
        const idx = registrations.findIndex(r => r.id === id);
        if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '挂号单未找到' }));
        registrations[idx] = { ...registrations[idx], status: 3, status_desc: '已退费' };
        return res(ctx.status(200), ctx.json({ code: 0, data: {}, success: true }));
    }),

    // PUT /api/nurse/registrations/:id/cancel - 护士站取消挂号
    rest.put('/api/nurse/registrations/:id/cancel', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        const id = Number(req.params.id as string);
        const idx = registrations.findIndex(r => r.id === id);
        if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '挂号单未找到' }));
        registrations[idx] = { ...registrations[idx], status: 2, status_desc: '已取消' };
        return res(ctx.status(200), ctx.json({ code: 200, data: {}, success: true }));
    }),

    // PUT /api/nurse/registrations/:id/refund - 护士站挂号退费
    rest.put('/api/nurse/registrations/:id/refund', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        const id = Number(req.params.id as string);
        const idx = registrations.findIndex(r => r.id === id);
        if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '挂号单未找到' }));
        registrations[idx] = { ...registrations[idx], status: 3, status_desc: '已退费' };
        return res(ctx.status(200), ctx.json({ code: 200, data: {}, success: true }));
    }),

    // GET /api/common/prescriptions/:id
    rest.get('/api/common/prescriptions/:id', (req: RestRequest, res: ResponseComposition, ctx: RestContext) => {
        const id = Number(req.params.id as string);
        // 简单模拟处方返回
        const pres = {
            id,
            patientName: '张三',
            totalAmount: '100.00',
            items: [{ drugName: '阿莫西林', spec: '0.5g', count: 2 }]
        };
        return res(ctx.status(200), ctx.json({ code: 0, data: pres }));
    })
];

export { handlers };
export function __resetMockData() {
    // 重新初始化，方便测试之间复用
    charges = [
        {
            id: 1,
            chargeNo: 'C001',
            patientName: '张三',
            totalAmount: '100.00',
            status: RegistrationStatus.WAITING,
            statusDesc: '待就诊',
            createdAt: '2025-01-01 12:00:00',
            details: [
                { itemName: '挂号费', itemType: 'REGISTRATION', itemAmount: '100.00' }
            ],
            registrationId: 100
        },
        {
            id: 2,
            chargeNo: 'C002',
            patientName: '王五',
            totalAmount: '20.00',
            status: RegistrationStatus.PAID_REGISTRATION,
            statusDesc: '已缴挂号费',
            createdAt: '2025-01-01 12:05:00',
            details: [
                { itemName: '挂号费', itemType: 'REGISTRATION', itemAmount: '20.00' }
            ],
            registrationId: 200
        }
    ];

    // 重置挂号数据为带一个待诊与一个已缴费的示例
    registrations = [
        {
            id: 100,
            reg_no: 'REG100',
            patient_name: '李四',
            id_card: '110105199001011234',
            phone: '13100000001',
            gender: 1,
            status: RegistrationStatus.WAITING,
            status_desc: '待诊',
            sequence: 5,
            dept_name: '内科',
            doctor_name: '王医生',
            insurance_type: '自费'
        },
        {
            id: 200,
            reg_no: 'REG200',
            patient_name: '王五',
            id_card: '110105199001011235',
            phone: '13100000002',
            gender: 1,
            status: RegistrationStatus.PAID_REGISTRATION,
            status_desc: '已缴挂号费',
            sequence: 6,
            dept_name: '内科',
            doctor_name: '王医生',
            insurance_type: '自费'
        }
    ];
}
