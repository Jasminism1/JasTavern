// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { isInSillyTavern } from './env'
import { useAppStore } from './stores/app'
import { initializeDatabase } from './sillytavern'

async function mountApp() {
  // Initialize SillyTavern database (lorebooks / presets / settings / chats)
  await initializeDatabase()

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
    app.mount('#app')
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp)
} else {
  mountApp()
}
