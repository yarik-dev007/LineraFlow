import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3030,
      host: '0.0.0.0',
      allowedHosts: ['lineraflow.xyz', 'www.lineraflow.xyz', 'localhost'],
      headers: {
        // Required for SharedArrayBuffer support (Linera WASM)
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        preserveEntrySignatures: 'strict',
      },
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
