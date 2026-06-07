/**
 * JS-Slash-Runner Script (酒馆助手脚本)
 * 
 * 功能：监听来自第0层的 `st_ui:show_main_ui` 事件。
 * 当事件触发时，动态从本地或远端 CDN 导入完整的 Vue 游戏前端并接管界面。
 */
(function() {
    console.log("[ST-UI-Bridge] Listener script loaded and waiting for trigger...");
    
    // 开发模式 / 生产模式 的 URL 地址：
    // 开发时你可以用 VSCode 的 Live Server 或 Python 跑一个本地服务，指向 st-ui/dist 目录
    // 生产发布时，你可以把 dist/bundle.js 传到 GitHub，然后替换成 jsDelivr 的 CDN 地址
    const BUNDLE_URL = 'http://127.0.0.1:5500/dist/bundle.js'; 
    // 例如生产环境: const BUNDLE_URL = 'https://cdn.jsdelivr.net/gh/YourName/YourRepo@main/dist/bundle.js';
    
    let isUiInjected = false;

    async function injectVueApp() {
        if (isUiInjected || document.getElementById('st-custom-ui-root')) {
            console.log("[ST-UI-Bridge] UI already injected.");
            if (window.ST_Bridge && typeof window.ST_Bridge.enterUI === 'function') {
                window.ST_Bridge.enterUI();
            }
            return;
        }

        console.log("[ST-UI-Bridge] Downloading and executing Vue App bundle...");
        isUiInjected = true;

        try {
            // 通过动态 import 远程或本地的 bundle.js，执行内部的 IIFE 与 CSS 注入
            await import(BUNDLE_URL);
            console.log("[ST-UI-Bridge] Bundle loaded successfully!");
        } catch (error) {
            console.error("[ST-UI-Bridge] 无法加载游戏主文件。请确保你已启动本地静态服务器或 CDN 地址正确。", error);
            isUiInjected = false;
        }
    }

    // 监听第0层发出的事件
    if (typeof eventSource !== 'undefined') {
        eventSource.on('st_ui:show_main_ui', () => {
            console.log("[ST-UI-Bridge] 收到第0层触发信号！开始加载 UI...");
            injectVueApp();
        });
    } else {
        console.error("[ST-UI-Bridge] eventSource 找不到，酒馆事件系统未就绪。");
    }
})();
