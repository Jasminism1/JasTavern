// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Polyfill process.env for IIFE browser bundles (Dexie references process)
  define: {
    'process.env': '{}',
  },
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      name: 'STCustomUI',
      fileName: () => 'st-custom-ui.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
        // Polyfill process global for IIFE (Dexie internal uses process)
        banner: 'var process = globalThis.process || { env: {} };',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    cors: true,
  },
})
