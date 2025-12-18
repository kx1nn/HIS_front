import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://6e6c925b.r17.cpolar.top',
        changeOrigin: true,
        // 保留 /api 前缀，直接转发请求到后端的 /api/* 路径（后端 OpenAPI 使用 /api/registrations）
        secure: false,
      },
    },
  },
});
