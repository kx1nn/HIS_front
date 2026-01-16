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
    // 模拟后端 doctor/waiting-list 返回数据
    // 注意：响应拦截器会自动将snake_case转为camelCase
    server.use(
      rest.get('/api/doctor/waiting-list', (_req, res, ctx) => {
        const sample = [
          { 
            id: 200, 
            regNo: 'REG200',  // 已经是camelCase，因为响应拦截器会转换
            mrn: 'REG200',
            patientName: '王五',  // 已经是camelCase
            age: 45, 
            gender: 0, 
            status: 0,
            statusDesc: '候诊',
            sequence: 0,
            createTime: '2026-01-05',
            insuranceType: '自费',
            type: '初诊'
          }
        ];
        return res(ctx.status(200), ctx.json({ code: 0, data: sample }));
      })
    );

    // 保证有登录用户上下文
    useStore.getState().login({ role: 'doctor', name: 'DrTest', dept: '内科', userId: 1, relatedId: 1 });
    render(<MemoryRouter><DoctorStation /></MemoryRouter>);

    // 等待数据加载并查找患者姓名（文本在多个元素中，所以分开匹配）
    const nameElements = await screen.findAllByText((content, element) => {
      // 匹配包含"号 王五"的元素
      const hasText = element?.textContent?.includes('号') && element?.textContent?.includes('王五');
      return hasText || false;
    });
    expect(nameElements.length).toBeGreaterThan(0);
    expect(nameElements[0]).toBeInTheDocument();
  });
});