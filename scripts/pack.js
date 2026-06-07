const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '../dist');
const jsFile = path.join(distPath, 'st-custom-ui.js');
const cssFile = path.join(distPath, 'style.css');
const outputFile = path.join(distPath, 'bundle.js');

const jsContent = fs.readFileSync(jsFile, 'utf8');
const cssContent = fs.readFileSync(cssFile, 'utf8');

// Escape backticks and backslashes in CSS
const escapedCss = cssContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`');

const injectionScript = `
(function() {
  var style = document.createElement('style');
  style.innerHTML = \`${escapedCss}\`;
  document.head.appendChild(style);
})();
`;

fs.writeFileSync(outputFile, injectionScript + '\n' + jsContent);
console.log('Successfully created bundle.js with inline CSS!');
