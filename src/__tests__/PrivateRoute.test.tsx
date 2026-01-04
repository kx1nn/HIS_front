/* @vitest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// mock authApi.validate and useStore
import * as api from '../services/api';

// mock store with mutable state and helper
let _mockState: any = { token: null, user: null, notify: vi.fn(), logout: vi.fn() };
vi.mock('../store/store', () => {
  const useStore = (selector: (s: any) => any) => selector(_mockState);
  // attach getState to mimic Zustand API
  (useStore as any).getState = () => _mockState;
  (useStore as any).__setMockState = (s: any) => { _mockState = s; };
  return { useStore };
});

vi.spyOn(api.authApi, 'validate');

import PrivateRoute from '../components/PrivateRoute';

describe('PrivateRoute', () => {
  beforeEach(() => {
    _mockState = { token: null, user: null, notify: vi.fn(), logout: vi.fn() };
    (api.authApi.validate as unknown as any) = undefined;
    vi.resetAllMocks();
  });

  afterEach(() => { cleanup(); });


  test('redirects to /login when no token', async () => {
    _mockState.token = null;
    render(
      <MemoryRouter initialEntries={["/nurse"]}>
        <Routes>
          <Route path="/login" element={<div>LoginPage</div>} />
          <Route path="/nurse" element={<PrivateRoute><div>Protected</div></PrivateRoute>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('LoginPage')).toBeTruthy();
  });

  test('renders children when token valid and role matches path', async () => {
    _mockState.token = 't';
    _mockState.user = { role: 'nurse' };
    (api.authApi.validate as unknown as any) = vi.fn().mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={["/nurse"]}>
        <Routes>
          <Route path="/nurse" element={<PrivateRoute><div>Protected</div></PrivateRoute>} />
          <Route path="/login" element={<div>LoginPage</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Protected')).toBeTruthy());
  });

  test('redirects when validate fails', async () => {
    _mockState.token = 't';
    (api.authApi.validate as unknown as any) = vi.fn().mockResolvedValue(false);

    render(
      <MemoryRouter initialEntries={["/nurse"]}>
        <Routes>
          <Route path="/nurse" element={<PrivateRoute><div>Protected</div></PrivateRoute>} />
          <Route path="/login" element={<div>LoginPage</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('LoginPage')).toBeTruthy();
  });

  test('notifies and logs out when role mismatch', async () => {
    _mockState.token = 't';
    _mockState.user = { role: 'doctor' };
    (api.authApi.validate as unknown as any) = vi.fn().mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={["/nurse"]}>
        <Routes>
          <Route path="/nurse" element={<PrivateRoute><div>Protected</div></PrivateRoute>} />
          <Route path="/login" element={<div>LoginPage</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('LoginPage')).toBeTruthy());
    expect(_mockState.notify).toHaveBeenCalled();
    expect(_mockState.logout).toHaveBeenCalled();
  });
});
