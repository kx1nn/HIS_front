import { getToken, setToken, removeToken, getUser, setUser, removeUser, TOKEN_KEY, USER_KEY } from '../services/authStorage';

describe('authStorage', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('token set/get/remove', () => {
        expect(getToken()).toBeNull();
        setToken('abc');
        expect(getToken()).toBe('abc');
        removeToken();
        expect(getToken()).toBeNull();
    });

    test('user set/get/remove', () => {
        expect(getUser()).toBeNull();
        setUser({ name: 'test' });
        const u = getUser();
        expect(typeof u).toBe('object');
        removeUser();
        expect(getUser()).toBeNull();
    });
});