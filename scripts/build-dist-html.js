// scripts/build-dist-html.js
// Post-build: generates dist/index.html for standalone hosting (Vercel, etc.)
const fs = require('fs');
const path = require('path');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JasTavern</title>
  <link rel="stylesheet" href="style.css" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #0a0a12; overflow: hidden; }
    #app { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script src="st-custom-ui.js"></script>
</body>
</html>`;

const distDir = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
fs.writeFileSync(path.join(distDir, 'index.html'), html, 'utf-8');
console.log('✓ dist/index.html generated');
