const backendOrigin = process.env.MEDIASFU_BACKEND_ORIGIN || 'http://127.0.0.1:8790';

module.exports = {
  '/api': {
    target: backendOrigin,
    secure: false,
    changeOrigin: true,
  },
};
