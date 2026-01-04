/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';

interface MockStore {
  notifications: { id: number; type: string; message: string }[];
  removeNotification: (id: number) => void;
}

vi.mock('../store/store', () => ({
  useStore: ((selector: (s: MockStore) => unknown) => selector({
    notifications: [{ id: 1, type: 'success', message: 'ok' }],
    // 参数未使用，仅为类型匹配保留
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    removeNotification: (_id: number) => {}
  })) as unknown
}));

import ToastContainer from '../components/ToastContainer';

describe('ToastContainer', () => {
  test('renders notifications from store', () => {
    render(<ToastContainer />);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});