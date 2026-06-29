import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: '8080',
    hmr: {
      overlay: false,
    },
    proxy: {
      '/supabase-api': {
        // 开发环境代理目标：本地或远程 PostgREST 服务
        // 本地开发时设为 http://localhost:3000
        // 连接远程宝塔服务器时设为 https://<宝塔域名>
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
        // 去掉 /supabase-api 和 /rest/v1 前缀，PostgREST 在根路径提供服务
        rewrite: (path) => path.replace(/^\/supabase-api\/rest\/v1/, '').replace(/^\/supabase-api/, ''),
        secure: true,
      },
    },
  },
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  resolve: {
    alias: [
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
      {
        find: 'lib',
        replacement: resolve(fileURLToPath(new URL('.', import.meta.url)), 'lib'),
      },
    ],
  },
});
