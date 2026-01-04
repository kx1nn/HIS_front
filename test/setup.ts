import '@testing-library/jest-dom';

// MSW 测试服务器（如果需要时可在 ./mocks/server.ts 中添加 handler）
try {
    // optional, only if mocks/server exists
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { server } = require('./mocks/server');
    if (server) {
        beforeAll(() => server.listen());
        afterEach(() => server.resetHandlers());
        afterAll(() => server.close());
    }
} catch (e) {
    // no-op
}
