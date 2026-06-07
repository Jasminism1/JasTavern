---

# plan.md

# Plan: Integrating Custom Vue3+Vite UI into SillyTavern

## 1. Objective

Build a bridge and injection mechanism to seamlessly mount a custom Vue3 + Vite frontend over SillyTavern's default UI. The custom UI will run as an absolute-positioned fullscreen overlay while retaining full access to SillyTavern's backend APIs, frontend states, and lifecycle events via a secure window-level bridge.

## 2. Technical Stack & Architecture

* **Host System:** SillyTavern (Node.js / jQuery Environment)
* **Target UI:** Vue 3 (Composition API) + Vite + TypeScript
* **Injection Strategy:** `JS-Slash-Runner` / Native Extension loader pattern utilizing dynamic Script/Link tag injection.
* **Hot Module Replacement (HMR):** Dev mode injection targeting Vite Dev Server (`http://localhost:5173/src/main.ts`).

---

## 3. Implementation Steps

```
[Phase 1: Vite Config] ---> [Phase 2: Entry Point] ---> [Phase 3: CSS Overlay] ---> [Phase 4: Bridge] ---> [Phase 5: Extension Loader]

```

### Phase 1: Vite Bundling & Environment Configuration

Configure Vite to output a single IIFE bundle with unified CSS inline processing for production, ensuring zero asset path breakage inside SillyTavern's asset pipeline.

* [ ] **Action 1.1**: Update `vite.config.ts` to output a library format targeting `iife`.
* [ ] **Action 1.2**: Disable CSS code splitting (`cssCodeSplit: false`) so all layout definitions are packaged into one single file.

### Phase 2: Refactoring Vue App Mounting Entry

Prevent Vue from wiping out SillyTavern's native DOM root (`#app` / `#shadow-realm`). Instead, dynamically provision an isolated overlay anchor.

* [ ] **Action 2.1**: Modify `src/main.ts` to programmatically create and append a private root node `#st-custom-ui-root` directly to `document.body`.
* [ ] **Action 2.2**: Encapsulate mounting logic inside a `DOMContentLoaded` event listener ensuring predictable initialization sequence.

### Phase 3: Fullscreen Isolation Overlay Layout

Implement a robust CSS reset layer to isolate the custom UI container from SillyTavern’s global styles and forcefully cover the native interface.

* [ ] **Action 3.1**: Create a layout rule mapping `#st-custom-ui-root` to standard viewport bounds (`position: fixed`, `top: 0`, `left: 0`, `100vw/100vh`).
* [ ] **Action 3.2**: Enforce a maximum z-index (`z-index: 999999`) and block click-through behaviors using `pointer-events: auto`.

### Phase 4: Constructing Context & State Bridge

Expose SillyTavern's core state managers, module registries, and custom networking proxies over a clean, typed `window.ST_Bridge` API surface.

* [ ] **Action 4.1**: Map internal SillyTavern context getters (`getContext`, `characters`, `token`, `callPopup`) to safe window accessors.
* [ ] **Action 4.2**: Standardize an authenticated `sendToBackend(endpoint, data)` wrapper executing native fetches with correct CSRF token headers.
* [ ] **Action 4.3**: Implement TypeScript ambient declarations (`src/env.d.ts`) to provide autocompletion for `window.ST_Bridge` within Vue modules.

### Phase 5: Designing the Loader / Injection Script

Develop the extension initialization script that routes asset loading conditionally based on environmental states (Development vs Production).

* [ ] **Action 5.1**: Write `bridge/loader.js` to execute as a SillyTavern plugin extension step.
* [ ] **Action 5.2**: Add environment toggling branch inside `loader.js`:
* **Development:** Injects `http://localhost:5173/src/main.ts` as `type="module"` to stream HMR updates straight to the open tab.
* **Production:** Injects local relative path references pointing to `/plugins/.../dist/` assets.



---

## 4. Reference Code Blocks

### `vite.config.ts` Specification

```typescript
import { defineConfig } from 'vite';
import vue from '@vue/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  build: {
    cssCodeSplit: false, 
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'STCustomUI',
      fileName: () => 'st-custom-ui.js',
      formats: ['iife']
    },
    outDir: 'dist'
  }
});

```

### `src/main.ts` Setup

```typescript
import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

function initOverlay() {
  if (document.getElementById('st-custom-ui-root')) return;
  const rootDiv = document.createElement('div');
  rootDiv.id = 'st-custom-ui-root';
  document.body.appendChild(rootDiv);

  const app = createApp(App);
  app.mount('#st-custom-ui-root');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOverlay);
} else {
  initOverlay();
}

```

### Global Overlay Reset Styling

```css
#st-custom-ui-root {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 999999;
  background-color: #0c0d14; /* Deep neutral background matching standard UI specs */
  overflow: hidden;
  box-sizing: border-box;
  pointer-events: auto;
}

```

### `bridge/loader.js` Architecture

```javascript
(function() {
    console.log("[ST-UI-Bridge] Initialization Triggered.");
    
    const IS_DEV = true; // Toggle true for rapid local Vite hacking, false for production build injection
    
    if (IS_DEV) {
        // HMR Module Mode
        const devScript = document.createElement('script');
        devScript.src = 'http://localhost:5173/src/main.ts';
        devScript.type = 'module';
        document.body.appendChild(devScript);
    } else {
        // Production Static Mode
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = '/plugins/st-custom-ui/dist/style.css';
        document.head.appendChild(styleLink);

        const prodScript = document.createElement('script');
        prodScript.src = '/plugins/st-custom-ui/dist/st-custom-ui.js';
        prodScript.type = 'text/javascript';
        document.body.appendChild(prodScript);
    }
})();

```

---

## 5. Verification Checklist

* [ ] Running `npm run dev` in the Vue project serves HMR without throwing CORS exceptions.
* [ ] Opening SillyTavern completely covers the default view blocks with the target Vue layout.
* [ ] Executing `window.ST_Bridge.getCharactersList()` within the Vue Console accurately pulls characters array state from the host environment.
* [ ] Running production `npm run build` bundles assets down to exactly 1 JS and 1 CSS file without breaking style definitions.