/// <reference types="vitest" />
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChargeManagement from '../pages/NurseStation/ChargeManagement';
import { vi } from 'vitest';
import { __resetMockData } from '../../test/mocks/handlers';

describe('ChargeManagement 页面集成测试 - 缴费流程', () => {
  beforeEach(() => {
    __resetMockData();
  });

  it('可以加载收费单并完成缴费，状态从待缴费变更为已缴费', async () => {
    const user = userEvent.setup();

    // 捕获 alert
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<ChargeManagement />);

    // 等待列表项出现（患者姓名）
    expect(await screen.findByText('张三')).toBeInTheDocument();

    // 选中该收费单
    await user.click(screen.getByText('张三'));

    // 确认收费按钮出现并点击
    const confirmBtn = await screen.findByRole('button', { name: /确认收费/ });
    await user.click(confirmBtn);

    // 收银台弹窗出现
    expect(await screen.findByText('收银台')).toBeInTheDocument();

    // 点击确认收款
    const payBtn = screen.getByRole('button', { name: /确认收款/ });
    await user.click(payBtn);

    // 等待 alert 被调用 表示缴费成功
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('缴费成功');
    });

    // 列表中的状态更新为已缴费（在对应收费单项内）
    const card = screen.getByText('张三').closest('div') as HTMLElement | null;
    expect(card).not.toBeNull();
    await waitFor(() => {
      expect(within(card as HTMLElement).getByText('已缴费')).toBeInTheDocument();
    });

    alertSpy.mockRestore();
  });
});
