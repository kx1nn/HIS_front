import * as msw from 'msw';
import type { RequestHandler } from 'msw';

// 兼容：如果 msw 导出 http（v2），使用 http；否则回退到 rest（v1）
const http: any = (msw as any).http ?? (msw as any).rest;
const isHttp = Boolean((msw as any).http);

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

const handlers: any[] = [
    // GET 列表
    isHttp
        ? http.get('/api/cashier/charges', () => {
            return new Response(JSON.stringify({ code: 0, data: { content: charges, total: charges.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        })
        : (msw as any).rest.get('/api/cashier/charges', (req: any, res: any, ctx: any) => {
            return res(ctx.status(200), ctx.json({ code: 0, data: { content: charges, total: charges.length } }));
        }),

    // POST 支付
    isHttp
        ? http.post('/api/cashier/charges/:id/pay', async (req: any) => {
            const { id } = req.params;
            const nid = Number(id);
            const idx = charges.findIndex((c: any) => c.id === nid);
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
        })
        : (msw as any).rest.post('/api/cashier/charges/:id/pay', async (req: any, res: any, ctx: any) => {
            const id = Number(req.params.id);
            const idx = charges.findIndex((c: any) => c.id === id);
            if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '未找到收费单' }));
            charges[idx] = { ...charges[idx], status: 1, statusDesc: '已缴费' };
            return res(ctx.status(200), ctx.json({ code: 0, data: charges[idx] }));
        }),

    // POST 退费
    isHttp
        ? http.post('/api/cashier/charges/:id/refund', async (req: any) => {
            const { id } = req.params;
            const nid = Number(id);
            const idx = charges.findIndex((c: any) => c.id === nid);
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
        : (msw as any).rest.post('/api/cashier/charges/:id/refund', async (req: any, res: any, ctx: any) => {
            const id = Number(req.params.id);
            const idx = charges.findIndex((c: any) => c.id === id);
            if (idx === -1) return res(ctx.status(404), ctx.json({ code: 404, message: '未找到收费单' }));
            charges[idx] = { ...charges[idx], status: 2, statusDesc: '已退费' };
            return res(ctx.status(200), ctx.json({ code: 0, data: charges[idx] }));
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
