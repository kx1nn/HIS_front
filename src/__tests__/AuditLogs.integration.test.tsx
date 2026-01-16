/* @vitest-environment jsdom */
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import * as api from '../services/api';
import type { AppState } from '../store/store';

// mock store
let _mockState: Partial<AppState> = { token: null, user: null, notify: vi.fn(), logout: vi.fn() };
vi.mock('../store/store', () => {
  const useStore = ((selector: (s: Partial<AppState>) => unknown) => selector(_mockState)) as unknown as (<T>(selector: (s: Partial<AppState>) => T) => T) & { getState: () => Partial<AppState>; __setMockState?: (s: Partial<AppState>) => void };
  useStore.getState = () => _mockState;
  useStore.__setMockState = (s: Partial<AppState>) => { _mockState = s; };
  return { useStore };
});

vi.mock('../services/api');

import PrivateRoute from '../components/PrivateRoute';
import AuditLogsPage from '../pages/Admin/AuditLogs';

const originalLocation = window.location;
const originalOpen = window.open;
const originalAnchorClick = HTMLAnchorElement.prototype.click;

beforeAll(() => {
  // mock navigation APIs to silence jsdom warnings
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...originalLocation, href: originalLocation.href, assign: vi.fn(), replace: vi.fn() }
  });
  window.open = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterAll(() => {
  Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  window.open = originalOpen;
  HTMLAnchorElement.prototype.click = originalAnchorClick;
});

const samplePage = {
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true,
  size: 20,
  content: [
    {
      id: 1,
      module: '认证管理',
      action: '用户登录',
      auditType: 'SENSITIVE_OPERATION',
      description: '用户 admin 成功登录',
      operatorId: 1,
      operatorUsername: 'admin',
      traceId: 'abcd1234',
      requestIp: '127.0.0.1',
      userAgent: 'test-agent',
      status: 'SUCCESS',
      executionTime: 10,
      createTime: new Date().toISOString()
    }
  ],
  number: 0,
  numberOfElements: 1,
  empty: false
};

describe('AuditLogs page', () => {
  beforeEach(() => {
    _mockState = { token: 't', user: { name: 'admin', dept: 'Admin', role: 'admin' }, notify: vi.fn(), logout: vi.fn() }; 
    (api.auditApi.search as ReturnType<typeof vi.fn>).mockResolvedValue(samplePage);
    // ensure auth validation passes for PrivateRoute
    (api.authApi.validate as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    // mock createObjectURL to avoid DOM APIs errors
    global.URL.createObjectURL = vi.fn(() => 'blob:url') as unknown as typeof URL.createObjectURL;
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  test('renders and shows audit entry', async () => {
    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]}>
        <Routes>
          <Route path="/admin/audit-logs" element={<PrivateRoute><AuditLogsPage /></PrivateRoute>} />
          <Route path="/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('审计日志管理')).toBeTruthy());
    expect(await screen.findByText('admin')).toBeTruthy();
    expect(screen.getByText('认证管理')).toBeTruthy();
  });

  test('export calls search with large size', async () => {
    render(
      <MemoryRouter initialEntries={["/admin/audit-logs"]}>
        <Routes>
          <Route path="/admin/audit-logs" element={<PrivateRoute><AuditLogsPage /></PrivateRoute>} />
        </Routes>
      </MemoryRouter>
    );

    // wait initial load
    await waitFor(() => expect(api.auditApi.search).toHaveBeenCalled());

    const exportBtn = await screen.findByText('导出 CSV');
    fireEvent.click(exportBtn);

    await waitFor(() => expect(api.auditApi.search).toHaveBeenCalledWith(expect.objectContaining({ size: 10000 }))); 
  });
});
