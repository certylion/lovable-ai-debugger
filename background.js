// Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log('Lovable AI Debug Helper extension installed.');
  // You could set default settings here using chrome.storage.local.set()
});

// Listen for messages if needed (e.g., from content scripts or panel)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message);
    // Example: Handle a request that needs background processing
    if (message.action === "performBackgroundTask") {
        // Do something in the background
        sendResponse({ status: "Background task completed" });
    }
    return true; // Indicates you wish to send a response asynchronously
});

// Keep alive logic (basic example, might need refinement for complex tasks)
let keepAliveInterval;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'keepAlive') {
    keepAliveInterval = setInterval(() => {
      port.postMessage({ message: 'ping' });
    }, 25 * 1000); // Ping every 25 seconds

    port.onDisconnect.addListener(() => {
      clearInterval(keepAliveInterval);
    });
  }
});