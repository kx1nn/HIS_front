/* @vitest-environment jsdom */
/// <reference types="vitest" />
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// mock authApi.validate and useStore
import * as api from '../services/api';

// mock store with typed mutable state and helper
type MockState = { token: string | null; user: { role?: string } | null; notify: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn> };
let _mockState: MockState = { token: null, user: null, notify: vi.fn(), logout: vi.fn() };
vi.mock('../store/store', () => {
  // typed useStore that mimics Zustand selector behavior and exposes getState/__setMockState
  const useStore = ((selector: (s: MockState) => unknown) => selector(_mockState)) as unknown as (<T>(selector: (s: MockState) => T) => T) & { getState: () => MockState; __setMockState?: (s: MockState) => void };
  useStore.getState = () => _mockState;
  useStore.__setMockState = (s: MockState) => { _mockState = s; };
  return { useStore };
});

vi.spyOn(api.authApi, 'validate');

import PrivateRoute from '../components/PrivateRoute';

describe('PrivateRoute', () => {
  beforeEach(() => {
    _mockState = { token: null, user: null, notify: vi.fn(), logout: vi.fn() };
    // ensure no lingering mock implementation
    delete (api.authApi as unknown as Record<string, unknown>).validate;
    vi.restoreAllMocks();
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
    vi.spyOn(api.authApi, 'validate').mockResolvedValue(true);

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
    vi.spyOn(api.authApi, 'validate').mockResolvedValue(false);

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
    vi.spyOn(api.authApi, 'validate').mockResolvedValue(true);

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
