import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// 기본 레이아웃 사용: main=src/main/index.ts, preload=src/preload/index.ts, renderer=src/renderer/index.html
// externalizeDepsPlugin: better-sqlite3(네이티브) 등 dependencies를 메인 번들에 넣지 않고 외부화.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
