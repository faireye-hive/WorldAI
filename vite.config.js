import { defineConfig } from 'vite';

const localOllama = process.env.WORLDAI_OLLAMA_URL || 'http://127.0.0.1:11434';

export default defineConfig({
  base: process.env.GITHUB_PAGES === '1' ? '/WorldAI/' : '/',
  build: { target: 'es2022' },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/ollama': {
        target: localOllama,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/ollama/, '/api')
      }
    }
  }
});
