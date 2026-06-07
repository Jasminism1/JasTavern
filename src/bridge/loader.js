// src/bridge/loader.js
// This script should be loaded via JS-Slash-Runner or as a native SillyTavern extension index.js.

(function() {
  console.log("[ST-UI-Bridge] Initialization Triggered.");
  
  // Toggle true for rapid local Vite hacking, false for production build injection
  const IS_DEV = true; 
  
  if (IS_DEV) {
      // HMR Module Mode
      const devScript = document.createElement('script');
      devScript.src = 'http://localhost:5173/src/main.ts';
      devScript.type = 'module';
      document.body.appendChild(devScript);
  } else {
      // Production Static Mode
      // You should adjust this path depending on where your extension is installed in SillyTavern
      const basePath = '/scripts/extensions/st-custom-ui/';
      
      const styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = basePath + 'dist/style.css';
      document.head.appendChild(styleLink);

      const prodScript = document.createElement('script');
      prodScript.src = basePath + 'dist/st-custom-ui.js';
      prodScript.type = 'text/javascript';
      document.body.appendChild(prodScript);
  }
})();
