import { defineConfig } from 'vite';
export default defineConfig({base: process.env.GITHUB_PAGES === '1' ? '/WorldAI/' : '/', build: {target:'es2022'}});
