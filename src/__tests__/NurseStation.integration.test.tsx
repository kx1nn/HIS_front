import { describe, beforeEach, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NurseStation from '../pages/NurseStation';
import { __resetMockData } from '../../test/mocks/handlers';
import { useStore } from '../store/store';
import type { AppState } from '../store/store';

import type { ChargeVO } from '../types';

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

  it('加载医生时显示 spinner，并在后端返回空时保留旧数据且不触发通知或显示重试', async () => {
    const { basicApi } = await import('../services/api');
    // 使用一个可控的未决 Promise，以便先断言 spinner 再 resolve
    let resolveFn!: (v: import('../services/api').RawDoctor[]) => void;
    const pending = new Promise<import('../services/api').RawDoctor[]>(res => { resolveFn = res; });
    const getSpy = vi.spyOn(basicApi, 'getDoctors').mockReturnValue(pending as unknown as Promise<import('../services/api').RawDoctor[]>);

    const notifyMock = vi.fn();
    const originalNotify = (useStore.getState() as AppState).notify;
    (useStore.getState() as AppState).notify = notifyMock;

    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    // 初始 prefilled 医生应当可见
    expect((await screen.findAllByText('王医生')).length).toBeGreaterThan(0);

    // 等待 spinner 显示
    await waitFor(() => expect(screen.getByText('正在加载医生...')).toBeInTheDocument());

    // 让请求完成（返回空）
    resolveFn([]);
    await waitFor(() => expect(notifyMock).not.toHaveBeenCalled());

    // 旧数据应被保留，且显示加载错误文本
    expect(screen.getAllByText('王医生').length).toBeGreaterThan(0);
    expect(screen.getByText('无法加载该科室医生，请检查后端或网络。')).toBeInTheDocument();

    getSpy.mockRestore();
    (useStore.getState() as AppState).notify = originalNotify;
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

  it('按回车在老患者查询框应触发查询并在单个结果时自动填充表单', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    // 输入唯一匹配的老患者姓名并按回车
    const searchOldInput = screen.getByPlaceholderText('搜索老患者：姓名/身份证/手机号');
    await user.type(searchOldInput, '老张');
    // 模拟回车
    await user.keyboard('{Enter}');

    // 等待表单被自动填充（并锁定为只读）
    await waitFor(() => expect(screen.getByPlaceholderText('患者姓名')).toHaveValue('老张'));
    expect(screen.getByPlaceholderText('扫描或输入身份证号')).toHaveValue('110105199001011237');
    expect(screen.getByPlaceholderText('手机号码')).toHaveValue('13100000003');
    // 填充到单个老患者后，姓名和手机号应被锁定（不可编辑）
    expect(screen.getByPlaceholderText('患者姓名')).toBeDisabled();
    expect(screen.getByPlaceholderText('手机号码')).toBeDisabled();
    // 性别按钮也应被锁定
    expect(screen.getByRole('button', { name: /👨/ })).toBeDisabled();
  });

  it('输入有效身份证并失焦后应自动解析年龄和性别，且姓名仍可编辑', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    const idInput = screen.getByPlaceholderText('扫描或输入身份证号');
    // 使用 mock 中已存在的身份证（110105199001011232）能被解析但不会匹配到老用户（我们没有针对该号码返回单个患者）
    await user.type(idInput, '110105199001011232');
    idInput.blur();

    // 等待解析结果显示（年龄应该是数字字符串 - 1990年出生的人在2026年是36岁）
    await waitFor(() => expect(screen.getByPlaceholderText('年龄')).toHaveValue('36'));

    // 性别按钮应被锁定（不可切换）但姓名仍可编辑
    expect(screen.getByRole('button', { name: /👨/ })).toBeDisabled();
    expect(screen.getByPlaceholderText('患者姓名')).not.toBeDisabled();
  });

  it('创建挂号时若后端未返回 status，应将状态默认显示为待就诊', async () => {
    const user = userEvent.setup();
    // 使用假定时器以便触发组件内的 setTimeout
    vi.useFakeTimers();

    // mock registrationApi.create 使其立即返回数据（不包含 status 字段）
    const { registrationApi, chargeApi } = await import('../services/api');
    const fakeData = {
      id: 999,
      regNo: 'REG999',
      patientName: '测试患者',
      idCard: '110105199001011239',
      phone: '13100000009',
      gender: 1,
      deptName: '内科',
      doctorName: '王医生',
      sequence: 999
    } as unknown as import('../types').RegistrationVO;
    const spy = vi.spyOn(registrationApi, 'create').mockResolvedValue({ success: true, data: fakeData });
    const checkSpy = vi.spyOn(chargeApi, 'checkRegistrationPaymentStatus').mockResolvedValue(true);

    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    // 填写表单必填项
    await user.type(screen.getByPlaceholderText('患者姓名'), '测试患者');
    await user.type(screen.getByPlaceholderText('扫描或输入身份证号'), '110105199001011239');
    await user.type(screen.getByPlaceholderText('手机号码'), '13100000009');

    // 选择医生（点击存在的医生）
    const doctorCard = await screen.findByText('王医生');
    await user.click(doctorCard);

    // 提交挂号
    const submitBtn = screen.getByRole('button', { name: /确认挂号/ });
    await user.click(submitBtn);

    // 快进定时器以触发延迟的挂号创建逻辑
    vi.advanceTimersByTime(3000);
    // 触发所有定时器并等待异步任务完成
    await vi.runAllTimersAsync();

    // 等待页面更新并检查新建条目为待就诊
    await waitFor(() => expect(screen.getByText('测试患者')).toBeInTheDocument());
    const card = screen.getByText('测试患者').closest('tr') as HTMLElement;
    expect(card).not.toBeNull();
    await waitFor(() => expect(within(card!).getByText('待就诊')).toBeInTheDocument());

    spy.mockRestore();
    checkSpy.mockRestore();
    vi.useRealTimers();
  });

  it('创建挂号但未检测到缴费时应提示并为该挂号创建收费单，不显示回执', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers();

    const { registrationApi, chargeApi } = await import('../services/api');
    const fakeData = {
      id: 1001,
      regNo: 'REG1001',
      patientName: '未缴费患者',
      idCard: '110105199001011240',
      phone: '13100000010',
      gender: 1,
      deptName: '内科',
      doctorName: '王医生',
      sequence: 1001
    } as unknown as import('../types').RegistrationVO;

    const regSpy = vi.spyOn(registrationApi, 'create').mockResolvedValue({ success: true, data: fakeData });
    const checkSpy = vi.spyOn(chargeApi, 'checkRegistrationPaymentStatus').mockResolvedValue(false);
const createChargeSpy = vi.spyOn(chargeApi, 'createRegistrationCharge').mockResolvedValue({ id: 5001, chargeNo: 'C5001', patientId: 1001, patientName: '未缴费患者', totalAmount: '20.00', status: 0, statusDesc: '待就诊', createdAt: new Date().toISOString(), details: [] } as ChargeVO);
    
    // Spy notify
    const notifyMock = vi.fn();
    const originalNotify = (useStore.getState() as AppState).notify;
    (useStore.getState() as AppState).notify = notifyMock;

    render(<MemoryRouter><NurseStation /></MemoryRouter>);

    await user.type(screen.getByPlaceholderText('患者姓名'), '未缴费患者');
    await user.type(screen.getByPlaceholderText('扫描或输入身份证号'), '110105199001011240');
    await user.type(screen.getByPlaceholderText('手机号码'), '13100000010');

    const doctorCard = await screen.findByText('王医生');
    await user.click(doctorCard);

    const submitBtn = screen.getByRole('button', { name: /确认挂号/ });
    await user.click(submitBtn);

    vi.advanceTimersByTime(3000);

    // 等待页面更新
    await waitFor(() => expect(screen.getByText('未缴费患者')).toBeInTheDocument());
    const card = screen.getByText('未缴费患者').closest('tr') as HTMLElement;
    expect(card).not.toBeNull();
    // 应该没有回执弹窗（回执标题为'挂号成功'）
    expect(screen.queryByText('挂号成功')).toBeNull();

    // notify 被调用以提示用户去收费
    expect(notifyMock).toHaveBeenCalled();

    // 恢复 notify
    (useStore.getState() as AppState).notify = originalNotify;
    regSpy.mockRestore();
    checkSpy.mockRestore();
    createChargeSpy.mockRestore();
    vi.useRealTimers();
  });
});