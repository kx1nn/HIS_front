import { rest } from 'msw';

export const handlers = [
    // 示例：mock 登录接口
    rest.post('/auth/login', (req, res, ctx) => {
        return res(ctx.json({ code: 0, data: { token: 'fake-token', role: 'nurse', realName: '测试用户' } }));
    }),
];
