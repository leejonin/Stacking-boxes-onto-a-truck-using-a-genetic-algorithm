import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// GitHub Pages의 저장소 하위 경로와 로컬 개발 루트 경로를 구분한다.
const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' && repository ? `/${repository}/` : '/',
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
});
