import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'renderer',
  plugins: [react()],
  publicDir: '../../frontend/public',
  resolve: { alias: { '@': fileURLToPath(new URL('../frontend/src', import.meta.url)) } },
  define: {
    'process.env.NEXT_PUBLIC_API_BASE_URL': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID': JSON.stringify(''),
    'process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL': JSON.stringify(''),
  },
  build: { target: 'esnext', outDir: '../dist', emptyOutDir: true },
  css: { postcss: fileURLToPath(new URL('../frontend', import.meta.url)) },
});
