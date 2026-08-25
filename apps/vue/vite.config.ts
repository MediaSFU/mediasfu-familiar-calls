import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const backendOrigin = process.env.MEDIASFU_BACKEND_ORIGIN || 'http://127.0.0.1:8790';

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: { sdk: 'index.html', whipWhep: 'whip-whep.html' },
    },
  },
  server: { proxy: { '/api': backendOrigin } },
});
