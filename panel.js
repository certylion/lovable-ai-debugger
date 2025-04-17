const consoleOutput = document.getElementById('console-output');
const networkOutput = document.getElementById('network-output');
const generatedPrompt = document.getElementById('generated-prompt');
const aiResponseDiv = document.getElementById('ai-response');
const statusMessage = document.getElementById('status-message');
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key');
const sendToAiButton = document.getElementById('send-to-ai');
const copyPromptButton = document.getElementById('copy-prompt-button');

let collectedConsoleLogs = [];
let collectedNetworkSummary = "";
let apiKey = null; // Store API key fetched from storage

// --- API Key Handling ---

chrome.storage.local.get(['geminiApiKey'], function(result) {
    if (result.geminiApiKey) {
        apiKey = result.geminiApiKey;
        apiKeyInput.value = apiKey; // Keep type="password" for security
        console.log("API Key loaded.");
        checkAiButtonState();
    } else {
        console.log("API Key not found in storage.");
        statusMessage.textContent = "Enter and save your Gemini API Key to enable AI analysis.";
    }
});

saveKeyButton.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        chrome.storage.local.set({ geminiApiKey: key }, function() {
            apiKey = key;
            statusMessage.textContent = 'API Key saved locally.';
            console.log('API Key saved.');
            checkAiButtonState();
        });
    } else {
        apiKey = null; // Clear stored key if input is empty
        chrome.storage.local.remove('geminiApiKey', function() {
            statusMessage.textContent = 'API Key cleared.';
            console.log('API Key cleared.');
            checkAiButtonState();
        });
    }
});

function checkAiButtonState() {
    // Enable "Send to AI" only if an API key is present AND a prompt has been generated
     sendToAiButton.disabled = !(apiKey && generatedPrompt.value.trim().length > 0 && generatedPrompt.value !== "Generating...");
}

// --- Data Collection ---

document.getElementById('collect-console').addEventListener('click', () => {
    collectedConsoleLogs = []; // Reset before collecting
    consoleOutput.value = "Attempting to capture new console logs...\n(Note: Only logs occurring *after* this button click might be captured reliably without the 'debugger' permission)";
    window.consoleLogsNeedRetrieval = false; // Reset retrieval state

    const scriptToInject = `
        (function() {
            if (!window.__debuggerAttached) {
                window.__debuggerAttached = true;
                window.__collectedLogs = [];
                const originalLog = console.log;
                const originalWarn = console.warn;
                const originalError = console.error;

                const logHandler = (type, args) => {
                     const message = Array.from(args).map(arg => {
                        try {
                            if (arg instanceof Element) return '[DOM Element]';
                            if (typeof arg === 'function') return '[Function]';
                            if (arg instanceof Error) return arg.stack || arg.message;
                            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                        } catch (e) {
                            return '[Unserializable Object]';
                        }
                    }).join(' ');
                    if (window.__collectedLogs.length < 200) {
                         window.__collectedLogs.push({ type: type, message: message, timestamp: new Date().toISOString() });
                    } else if (window.__collectedLogs.length === 200) {
                         window.__collectedLogs.push({ type: 'system', message: 'Log limit reached.', timestamp: new Date().toISOString() });
                    }
                };

                console.log = function(...args) { logHandler('log', args); originalLog.apply(console, args); };
                console.warn = function(...args) { logHandler('warn', args); originalWarn.apply(console, args); };
                console.error = function(...args) { logHandler('error', args); originalError.apply(console, args); };
                console.log('Lovable Debugger: Console intercept active.');
             }
            return window.__collectedLogs;
        })();
    `;

    chrome.devtools.inspectedWindow.eval(
        scriptToInject,
        function(result, isException) {
            if (isException) {
                console.error("Error injecting console script:", isException);
                consoleOutput.value += "\nError injecting script: " + (isException.value || "Unknown error");
                statusMessage.textContent = "Error collecting console logs.";
            } else {
                consoleOutput.value = "Console log interceptor injected. New logs will be captured internally.\nClick 'Generate Prompt' later to retrieve them.";
                statusMessage.textContent = "Console intercept active. Interact with the page.";
                window.consoleLogsNeedRetrieval = true;
            }
        }
    );
});


document.getElementById('collect-network').addEventListener('click', () => {
    networkOutput.value = "Collecting network data...";
    chrome.devtools.network.getHAR((harLog) => {
        // --- BEGIN FIX: Safely check chrome.runtime and chrome.runtime.lastError ---
        if (chrome.runtime && chrome.runtime.lastError) {
        // --- END FIX ---
            console.error("Error fetching HAR log:", chrome.runtime.lastError); // Log the actual error object
            networkOutput.value = "Error fetching HAR log: " + chrome.runtime.lastError.message;
            statusMessage.textContent = "Error collecting network data.";
            collectedNetworkSummary = ""; // Reset
            return; // Stop execution if there was an error
        }

        // --- BEGIN FIX: Handle case where harLog is undefined/null even without lastError ---
        if (!harLog) {
            console.error("Failed to get HAR log, but no chrome.runtime.lastError reported.");
            networkOutput.value = "Failed to retrieve HAR log.";
            statusMessage.textContent = "Error collecting network data.";
            collectedNetworkSummary = "";
            return;
        }
        // --- END FIX ---


        // --- Rest of your HAR processing logic ---
        let errors = [];
        let slowRequests = [];
        const slowThresholdMs = 1000; // Example: 1 second

        harLog.entries.forEach(entry => {
            if (entry.response.status >= 400) {
                 errors.push(`- ${entry.request.method} ${entry.request.url.substring(0, 100)}${entry.request.url.length > 100 ? '...' : ''} (${entry.response.status} ${entry.response.statusText})`);
            }
            if (entry.time > slowThresholdMs) {
                slowRequests.push(`- ${entry.request.method} ${entry.request.url.substring(0, 100)}${entry.request.url.length > 100 ? '...' : ''} (${entry.time.toFixed(0)}ms)`);
            }
        });

        let summary = "Network Summary:\n";
        summary += `Total Requests: ${harLog.entries.length}\n`;

        if (errors.length > 0) {
            summary += `\nErrors (${errors.length}):\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? '\n(and more...)' : ''}\n`;
        } else {
            summary += "\nNo network errors (>=400) found.\n";
        }

        if (slowRequests.length > 0) {
            summary += `\nSlow Requests (> ${slowThresholdMs}ms) (${slowRequests.length}):\n${slowRequests.slice(0, 10).join('\n')}${slowRequests.length > 10 ? '\n(and more...)' : ''}\n`;
        } else {
            summary += "\nNo particularly slow requests found.\n";
        }

        collectedNetworkSummary = summary;
        networkOutput.value = collectedNetworkSummary;
        statusMessage.textContent = "Network data collected.";
    });
});


document.getElementById('clear-data').addEventListener('click', () => {
    collectedConsoleLogs = [];
    collectedNetworkSummary = "";
    consoleOutput.value = "";
    networkOutput.value = "";
    generatedPrompt.value = "";
    aiResponseDiv.textContent = "Waiting for analysis...";
    statusMessage.textContent = "Collected data cleared.";
    window.consoleLogsNeedRetrieval = false;
    checkAiButtonState();
});


// --- Prompt Generation & AI Call ---

document.getElementById('generate-prompt').addEventListener('click', async () => {
    statusMessage.textContent = "Generating prompt...";
    generatedPrompt.value = "Generating...";

    if (window.consoleLogsNeedRetrieval) {
        try {
             const result = await new Promise((resolve, reject) => {
                chrome.devtools.inspectedWindow.eval(
                    "window.__collectedLogs || []",
                    (evalResult, isException) => {
                        if (isException) reject(isException); else resolve(evalResult);
                    }
                );
            });

            if (result && Array.isArray(result)) {
                collectedConsoleLogs = result;
                consoleOutput.value = collectedConsoleLogs.map(log => `[${log.type.toUpperCase()}] ${log.timestamp}: ${log.message}`).join('\n');
                statusMessage.textContent = "Console logs retrieved.";
            } else {
                consoleOutput.value += "\n(Could not retrieve valid intercepted logs array. Manual copy/paste might be needed).";
                statusMessage.textContent = "Warning: Could not retrieve intercepted logs.";
            }
        } catch (error) {
            console.error("Error retrieving console logs:", error);
            consoleOutput.value += `\nError retrieving logs: ${error.value || error.message || "Unknown error"}`;
            statusMessage.textContent = "Error retrieving console logs.";
        }
    } else {
         if (consoleOutput.value === "") {
            consoleOutput.value = "(No console logs collected or retrieved yet)";
         }
         statusMessage.textContent = "Ready to generate prompt.";
    }

    const promptText = generateLovablePrompt(collectedConsoleLogs, collectedNetworkSummary);
    generatedPrompt.value = promptText;
    statusMessage.textContent = "Prompt generated.";
    checkAiButtonState();
});


function generateLovablePrompt(logs, network) {
    let prompt = `You are an AI debugging assistant. Analyze the following Chrome DevTools data (Console Logs and Network Summary) from a web application. Your goal is to identify potential problems, explain them clearly, and suggest concrete next steps.\n\n`;

    prompt += "--- CONSOLE LOGS ---\n";
    if (logs && logs.length > 0) {
        const maxLogChars = 2500;
        let logStr = logs.map(log => `[${log.type.toUpperCase()}] ${log.timestamp}: ${log.message}`).join('\n');
         if (logStr.length > maxLogChars) {
            logStr = logStr.substring(logStr.length - maxLogChars);
            prompt += `(Showing last ${maxLogChars} characters of ${logs.length} logs)\n...\n` + logStr;
         } else {
             prompt += logStr;
         }
    } else {
        prompt += "(No significant console logs captured or provided)\n";
    }
    prompt += "\n\n";

    prompt += "--- NETWORK SUMMARY ---\n";
    if (network && network.trim() !== "Network Summary:" && network.trim() !== "") {
        prompt += network;
    } else {
        prompt += "(No network summary available or collected)\n";
    }
    prompt += "\n\n";

    prompt += "--- ANALYSIS REQUEST ---\n";
    prompt += "Based ONLY on the data provided above, please:\n";
    prompt += "1.  **Identify Errors:** List any clear errors visible in the Console Logs or indicated by the Network Summary (e.g., 4xx/5xx status codes).\n";
    prompt += "2.  **Summarize Problem(s):** Briefly explain the most likely underlying issue(s) suggested by these errors or logs.\n";
    prompt += "3.  **Suggest Fixes/Next Steps:** Provide specific, actionable recommendations. This could include:\n";
    prompt += "    *   Code examples or specific settings to check.\n";
    prompt += "    *   Further debugging steps (e.g., 'Add a breakpoint in function X', 'Inspect network request payload for Y', 'Check variable Z').\n";
    prompt += "    *   If unsure, state what additional information would be needed.\n";
    prompt += "4.  **Prioritize:** If multiple issues exist, suggest which one to tackle first.\n";
    prompt += "\nFocus on practical solutions and clear explanations suitable for a developer.";

    return prompt;
}

// --- Copy Prompt Logic ---
copyPromptButton.addEventListener('click', () => {
    const promptText = generatedPrompt.value;
    if (promptText && promptText !== "Generating...") {
        // Use navigator.clipboard API (requires "clipboardWrite" permission in manifest)
        navigator.clipboard.writeText(promptText).then(() => {
            statusMessage.textContent = 'Prompt copied to clipboard!';
            const originalText = copyPromptButton.textContent;
            copyPromptButton.textContent = 'Copied!';
            setTimeout(() => { copyPromptButton.textContent = originalText; }, 2000);
        }).catch(err => {
            console.error('Failed to copy prompt: ', err);
            statusMessage.textContent = 'Error: Could not copy prompt to clipboard.';
            // Fallback for environments where clipboard API might fail
            try {
                 generatedPrompt.select();
                 document.execCommand('copy'); // Deprecated but may work as fallback
                 statusMessage.textContent = 'Prompt selected. Press Ctrl+C/Cmd+C to copy.';
            } catch (fallbackErr) {
                console.error('Fallback copy failed:', fallbackErr);
                 alert('Could not copy automatically. Please use Ctrl+C or Cmd+C.');
            }
        });
    } else {
        statusMessage.textContent = 'Generate a prompt first before copying.';
    }
});


// --- Send to AI Logic ---
sendToAiButton.addEventListener('click', async () => {
    if (!apiKey) {
        statusMessage.textContent = "Error: API Key not set. Save your key first.";
        return;
    }
    const currentPrompt = generatedPrompt.value;
    if (!currentPrompt || currentPrompt === "Generating...") {
         statusMessage.textContent = "Error: Generate a prompt first.";
         return;
    }

    statusMessage.textContent = "Sending prompt to Gemini AI...";
    aiResponseDiv.textContent = "⏳ Contacting AI...";
    sendToAiButton.disabled = true;
    copyPromptButton.disabled = true;

        // --- Try Gemini 1.5 Pro using the v1beta endpoint ---
    const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(GEMINI_API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "contents": [{"parts": [{"text": currentPrompt }]}],
                 "generationConfig": {
                    "temperature": 0.7,
                    "maxOutputTokens": 1024,
                    "topP": 1.0,
                    "topK": 40
                 }
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
            let errorBody = "Could not retrieve error details.";
            try {
                const errorData = await response.json();
                 errorBody = JSON.stringify(errorData.error || errorData, null, 2);
            } catch (e) {
                try { errorBody = await response.text(); } catch (e2) {}
            }
            throw new Error(`API Error: ${response.status} ${response.statusText}\nDetails:\n${errorBody}`);
        }

        const data = await response.json();

        const candidate = data?.candidates?.[0];
        let aiText = candidate?.content?.parts?.[0]?.text;

        if (!aiText) {
             if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                 aiText = `AI response generation finished unexpectedly. Reason: ${candidate.finishReason}`;
                 if(candidate.safetyRatings) aiText += `\nSafety Ratings: ${JSON.stringify(candidate.safetyRatings)}`;
             } else {
                aiText = "AI returned an empty response or the structure was unexpected.";
                console.warn("Unexpected AI response structure:", data);
             }
        }

        aiResponseDiv.textContent = aiText;
        statusMessage.textContent = "✅ AI analysis complete.";

    } catch (error) {
        console.error("AI API Call Error:", error);
        aiResponseDiv.textContent = `❌ Error contacting AI:\n${error.message}`;
         if (error.name === 'TimeoutError') {
            statusMessage.textContent = "Error: AI request timed out.";
         } else {
            statusMessage.textContent = "Error during AI analysis.";
         }
    } finally {
        checkAiButtonState();
        copyPromptButton.disabled = false;
    }
});

// Initial check
checkAiButtonState();