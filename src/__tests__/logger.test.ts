import { getRecentLogs, clearLogs, error, warn, info, debug } from '../services/logger';

describe('logger', () => {
    beforeEach(() => {
        clearLogs();
    });

    test('log and retrieve', () => {
        expect(getRecentLogs().length).toBe(0);
        error('err1');
        warn('w1');
        info('i1');
        // debug may not push to logs depending on implementation
        const logs = getRecentLogs();
        expect(logs.length).toBeGreaterThanOrEqual(2);
        expect(logs.some(l => l.level === 'error')).toBeTruthy();
        clearLogs();
        expect(getRecentLogs().length).toBe(0);
    });
});