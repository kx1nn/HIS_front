import { describe, beforeEach, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NurseStation from '../pages/NurseStation';
import { __resetMockData } from '../../test/mocks/handlers';
import { useStore } from '../store/store';

describe('NurseStation 集成测试 - 自动 camelize 响应', () => {
  beforeEach(() => {
    __resetMockData();
    // 初始化必要的全局数据，避免组件额外发起失败的网络请求
    useStore.getState().setDepartments([{ id: 1, name: '内科' }]);
    useStore.getState().setDoctors([{ id: 1, name: '王医生', deptId: 1, deptName: '内科', title: '', isWorking: true }]);
  });

  it('会正确接收 snake_case 后端并自动转换为 camelCase，显示患者姓名', async () => {
    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    // 等待自动加载的今日挂号（我们的 mock 返回的 patient_name 为 李四）
    expect(await screen.findByText('李四')).toBeInTheDocument();

    // 点击该患者行，右键菜单等交互不在本测试中检查
  });
  it('取消已缴费挂号会触发退费并更新状态', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    const row = await screen.findByText('王五');
    expect(row).toBeInTheDocument();

    const tableRow = row.closest('tr');
    if (!tableRow) throw new Error('Could not find table row for 王五');
    fireEvent.contextMenu(tableRow, { clientX: 100, clientY: 100 });

    const cancelMenu = await screen.findByText('退号');
    await user.click(cancelMenu);

    const confirmBtn = await screen.findByRole('button', { name: '确认退号' });
    await user.click(confirmBtn);

    // 等待退费通知出现
    const refundMessage = await screen.findByText(/退号成功，挂号费已返回原账号/, {}, { timeout: 3000 });
    expect(refundMessage).toBeInTheDocument();
  });
});