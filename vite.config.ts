import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    assetsInclude: ['**/*.wasm'],
    server: {
      port: 3030,
      host: '0.0.0.0',
      allowedHosts: true,
      headers: {
        // Required for SharedArrayBuffer support (Linera WASM)
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {}
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          linera: '@linera/client',
        },
        preserveEntrySignatures: 'strict',
      },
    },
    worker: {
      format: 'es',
      plugins: () => [],
    },
    optimizeDeps: {
      exclude: [
        '@linera/client', // Exclude from optimization for WASM to work
      ],
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
