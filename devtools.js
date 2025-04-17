// Creates the custom panel in Chrome DevTools
chrome.devtools.panels.create(
    "Lovable AI",            // Panel title
    "icons/icon16.png",      // Panel icon (optional)
    "panel.html",            // HTML page for the panel's content
    function(panel) {
        // Code invoked when the panel is created (optional)
        console.log("Lovable AI Debugger panel created.");
    }
);