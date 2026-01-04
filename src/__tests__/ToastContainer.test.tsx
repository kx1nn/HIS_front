/* @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';

vi.mock('../store/store', () => ({
  useStore: (selector: (s: any) => any) => selector({
    notifications: [{ id: 1, type: 'success', message: 'ok' }],
    removeNotification: (id: number) => {}
  }),
}));

import ToastContainer from '../components/ToastContainer';

describe('ToastContainer', () => {
  test('renders notifications from store', () => {
    render(<ToastContainer />);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});