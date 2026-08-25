import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'CALL_');
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { sdk: 'index.html', whipWhep: 'whip-whep.html' },
      },
    },
    server: {
      port: 4174,
      proxy: { '/api': env.CALL_BACKEND_ORIGIN || 'http://127.0.0.1:8790' },
    },
  };
});
