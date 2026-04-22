import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    root: 'src/renderer',
    publicDir: '../../public',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer')
      }
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        // Forward all /docs/* requests from frontend to FastAPI backend at :3456
        // (No rewrite needed — backend routes are already /docs/*)
        '/docs': {
          target: 'http://localhost:3456',
          changeOrigin: true,
          // Proxy /docs/upload, /docs/{docId}, /docs/{docId}/pdf, etc.
        },
        // Forward /upload directly to /docs/upload on backend
        '/upload': {
          rewrite: () => '/docs/upload',
          target: 'http://localhost:3456',
          changeOrigin: true,
        },
      },
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(''),
    },
    build: {
      outDir: '../../dist/web',
      emptyOutDir: true,
    }
  }
})
