import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DoctorStation from '../pages/DoctorStation';
import { __resetMockData } from '../../test/mocks/handlers';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { useStore } from '../store/store';

describe('DoctorStation 集成测试 - 候诊列表自动 camelize', () => {
  beforeEach(() => {
    __resetMockData();
  });

  it('在后端返回 snake_case 时，页面能正确显示患者姓名', async () => {
    // 模拟后端 doctor/waiting-list 返回 snake_case
    server.use(
      rest.get('/api/doctor/waiting-list', (_req, res, ctx) => {
        const sample = [
          { id: 200, reg_no: 'REG200', patient_name: '王五', patient_age: 45, gender: 0, status: 0 }
        ];
        return res(ctx.status(200), ctx.json({ code: 0, data: sample }));
      })
    );

    // 保证有登录用户上下文
    useStore.getState().login({ role: 'doctor', name: 'DrTest', dept: '内科', userId: 1, relatedId: 1 });
    render(<MemoryRouter><DoctorStation /></MemoryRouter>);

    expect(await screen.findByText('王五')).toBeInTheDocument();
  });
});