// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { isInSillyTavern } from './env'
import { useAppStore } from './stores/app'
import { initializeDatabase } from './sillytavern'

async function mountApp() {
  let appEl: HTMLElement | null = null

  try {
    // Initialize SillyTavern database (lorebooks / presets / settings / chats)
    await initializeDatabase()
  } catch (err) {
    console.warn('[JasTavern] IndexedDB init failed, continuing without persistence:', err)
    // Continue anyway — the app works without IndexedDB (loses persistence)
  }

  const app = createApp(App)
  app.use(createPinia())

  if (isInSillyTavern()) {
    if (!document.getElementById('st-custom-ui-root')) {
      const rootDiv = document.createElement('div')
      rootDiv.id = 'st-custom-ui-root'
      document.body.appendChild(rootDiv)
    }
    app.mount('#st-custom-ui-root')

    // Automatically enter the UI since the mount was triggered by the Layer 0 button
    useAppStore().enterUI()
  } else {
    appEl = document.getElementById('app')
    if (!appEl) {
      // Fallback: create mount point if #app is missing
      appEl = document.createElement('div')
      appEl.id = 'app'
      document.body.appendChild(appEl)
    }
    app.mount(appEl)
  }
}

// Make sure DOMContentLoaded is not missed even if the IIFE executes before body is parsed
function bootstrap() {
  mountApp().catch(err => {
    console.error('[JasTavern] Fatal mount error:', err)
    // Show fallback UI so the user knows something is broken, not just a blank page
    const root = document.getElementById('app') || document.getElementById('st-custom-ui-root') || document.body
    root.innerHTML += `<div style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:99999;padding:20px 32px;background:#2a1a1a;border:1px solid #a44;
      border-radius:6px;color:#faa;font-family:system-ui,sans-serif;text-align:center
    ">
      <h2>⚠ JasTavern 启动失败</h2>
      <p style="color:#ccc;font-size:13px">${String(err).slice(0, 200)}</p>
      <p style="color:#888;font-size:11px">请打开浏览器控制台查看详细错误</p>
    </div>`
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
