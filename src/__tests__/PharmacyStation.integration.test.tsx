import { describe, it, beforeEach, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PharmacyStation from '../pages/PharmacyStation';
import { __resetMockData } from '../../test/mocks/handlers';
import { server } from '../../test/mocks/server';
import { rest } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

describe('PharmacyStation 集成测试 - 药品响应自动 camelize', () => {
  beforeEach(() => {
    __resetMockData();
  });

  it('在后端返回 snake_case 药品字段时，页面能正确显示药品名与库存', async () => {
    server.use(
      rest.get('/api/common/medicines', (_req, res, ctx) => {
        const sample = [
          { main_id: 10, medicine_code: 'M010', name: '测试药', retail_price: '12.00', stock_quantity: 42 }
        ];
        return res(ctx.status(200), ctx.json({ code: 0, data: { content: sample, total: 1 } }));
      })
    );

    render(<MemoryRouter><PharmacyStation /></MemoryRouter>);

    // 点击药品信息标签切换到 inventory 视图
    const user = userEvent.setup();
    const btn = await screen.findByRole('button', { name: /药品信息/ });
    await user.click(btn);

    expect(await screen.findByText('测试药')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
  });
});