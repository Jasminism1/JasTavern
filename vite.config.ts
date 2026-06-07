// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      name: 'STCustomUI',
      fileName: () => 'st-custom-ui.js',
      formats: ['iife'],
    },
    // 打包为单 HTML 文件（方便 jsdelivr / Cloudflare R2 分发）
    rollupOptions: {
      output: {
        // 取消代码分块，全部打进一个 JS
        manualChunks: undefined,
      },
    },
  },
  // 开发时监听端口
  server: {
    port: 5173,
    // 启动时自动打开浏览器
    open: true,
    // 允许跨域（酒馆页面加载时需要）
    cors: true,
  },
})
