import { http } from 'msw';
import type { RequestHandler } from 'msw';

// 简单的内存存储，模拟后端收费单数据
let charges = [
    {
        id: 1,
        chargeNo: 'C001',
        patientName: '张三',
        totalAmount: 100,
        status: 0,
        statusDesc: '待缴费',
        createdAt: '2025-01-01 12:00:00',
        details: [
            { itemName: '检查费', itemType: '项目', itemAmount: 100 }
        ]
    }
];

const handlers: RequestHandler[] = [
    // GET 列表
    http.get('/api/cashier/charges', (req) => {
        return new Response(JSON.stringify({ code: 0, data: { content: charges, total: charges.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),

    // POST 支付
    http.post('/api/cashier/charges/:id/pay', async (req) => {
        const { id } = req.params;
        const nid = Number(id);
        const idx = charges.findIndex(c => c.id === nid);
        if (idx === -1) {
            return new Response(JSON.stringify({ code: 404, message: '未找到收费单' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // 简单模拟：将状态改为已缴费
        charges[idx] = {
            ...charges[idx],
            status: 1,
            statusDesc: '已缴费'
        };

        return new Response(JSON.stringify({ code: 0, data: charges[idx] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),

    // POST 退费
    http.post('/api/cashier/charges/:id/refund', async (req) => {
        const { id } = req.params;
        const nid = Number(id);
        const idx = charges.findIndex(c => c.id === nid);
        if (idx === -1) {
            return new Response(JSON.stringify({ code: 404, message: '未找到收费单' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        charges[idx] = {
            ...charges[idx],
            status: 2,
            statusDesc: '已退费'
        };

        return new Response(JSON.stringify({ code: 0, data: charges[idx] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
            totalAmount: 100,
            status: 0,
            statusDesc: '待缴费',
            createdAt: '2025-01-01 12:00:00',
            details: [
                { itemName: '检查费', itemType: '项目', itemAmount: 100 }
            ]
        }
    ];
}
