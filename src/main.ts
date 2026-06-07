// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { initBridge, isInSillyTavern } from './bridge'
import { useAppStore } from './stores/app'

function mountApp() {
  initBridge()
  
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
