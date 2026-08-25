import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'CALL_');
  return {
    server: {
      port: 4178,
      proxy: { '/api': env.CALL_BACKEND_ORIGIN || 'http://127.0.0.1:8790' },
    },
  };
});
