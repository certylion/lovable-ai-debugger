// ============================================================================
// Constants & Configuration
// ============================================================================

// --- Gemini API Configuration ---
const GEMINI_MODEL = 'gemini-1.5-pro-latest'; // Recommended model
const API_VERSION = 'v1beta'; // Endpoint version often used with latest models
const API_BASE_URL = `https://generativelanguage.googleapis.com/${API_VERSION}/models/`;
const API_KEY_STORAGE_KEY = 'geminiApiKey'; // Key used in chrome.storage.local

// --- Data Collection Configuration ---
const HAR_SLOW_THRESHOLD_MS = 1000; // Requests slower than this (in ms) are noted
const MAX_CONSOLE_LOG_ENTRIES = 200; // Limit number of intercepted logs stored
const MAX_CONSOLE_LOG_CHARS_IN_PROMPT = 2500; // Limit log text length in the prompt
const MAX_NETWORK_ERROR_LINES = 10; // Max network errors to show in summary
const MAX_NETWORK_SLOW_LINES = 10; // Max slow requests to show in summary

// ============================================================================
// DOM Element References
// ============================================================================

const consoleOutput = document.getElementById('console-output');
const networkOutput = document.getElementById('network-output');
const generatedPrompt = document.getElementById('generated-prompt');
const aiResponseDiv = document.getElementById('ai-response');
const statusMessage = document.getElementById('status-message');
const apiKeyInput = document.getElementById('api-key');
const saveKeyButton = document.getElementById('save-key');
const collectConsoleButton = document.getElementById('collect-console');
const collectNetworkButton = document.getElementById('collect-network');
const clearDataButton = document.getElementById('clear-data');
const generatePromptButton = document.getElementById('generate-prompt');
const sendToAiButton = document.getElementById('send-to-ai');
const copyPromptButton = document.getElementById('copy-prompt-button');

// ============================================================================
// Global State
// ============================================================================

let collectedConsoleLogs = [];
let collectedNetworkSummary = "";
let apiKey = null; // Store API key fetched from storage
let consoleLogsNeedRetrieval = false; // Flag if interceptor script needs querying

// ============================================================================
// API Key Handling
// ============================================================================

/**
 * Loads the Gemini API key from local Chrome storage on panel load.
 */
function loadApiKey() {
    chrome.storage.local.get([API_KEY_STORAGE_KEY], function(result) {
        if (result[API_KEY_STORAGE_KEY]) {
            apiKey = result[API_KEY_STORAGE_KEY];
            apiKeyInput.value = apiKey; // Keep type="password" for security
            console.log("API Key loaded.");
            statusMessage.textContent = "API Key loaded. Ready to collect data.";
        } else {
            console.log("API Key not found in storage.");
            statusMessage.textContent = "Enter and save your Gemini API Key to enable AI analysis.";
        }
        checkAiButtonState(); // Update button state based on key presence
    });
}

/**
 * Saves or clears the API key in local Chrome storage.
 */
function handleSaveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
        // Save the key
        chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: key }, function() {
            // Check for errors during save
            if (chrome.runtime.lastError) {
                console.error("Error saving API key:", chrome.runtime.lastError);
                statusMessage.textContent = `Error saving API key: ${chrome.runtime.lastError.message}`;
                return;
            }
            apiKey = key;
            statusMessage.textContent = 'API Key saved locally.';
            console.log('API Key saved.');
            checkAiButtonState();
        });
    } else {
        // Clear the key if input is empty
        apiKey = null;
        chrome.storage.local.remove(API_KEY_STORAGE_KEY, function() {
             if (chrome.runtime.lastError) {
                console.error("Error removing API key:", chrome.runtime.lastError);
                statusMessage.textContent = `Error clearing API key: ${chrome.runtime.lastError.message}`;
                return;
            }
            statusMessage.textContent = 'API Key cleared.';
            console.log('API Key cleared.');
            checkAiButtonState();
        });
    }
}

// ============================================================================
// UI State Management
// ============================================================================

/**
 * Enables or disables the "Send to AI" button based on API key and prompt state.
 */
function checkAiButtonState() {
    const hasApiKey = !!apiKey;
    const hasGeneratedPrompt = generatedPrompt.value.trim().length > 0 && generatedPrompt.value !== "Generating...";
    sendToAiButton.disabled = !(hasApiKey && hasGeneratedPrompt);
}

// ============================================================================
// Data Collection Logic
// ============================================================================

/**
 * Injects a script into the inspected window to intercept console messages.
 */
function collectConsoleLogsHandler() {
    collectedConsoleLogs = []; // Reset logs
    consoleOutput.value = "Attempting to capture new console logs...\n(Note: Only logs occurring *after* this button click might be captured reliably without the 'debugger' permission)";
    consoleLogsNeedRetrieval = false; // Reset retrieval state

    // Script to inject into the inspected page's context
    const scriptToInject = `
        (function() {
            // Prevent multiple attachments if button is clicked again
            if (window.__lovableDebuggerAttached) { return window.__collectedLogs || []; }
            window.__lovableDebuggerAttached = true;
            window.__collectedLogs = [];
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;
            const MAX_LOGS = ${MAX_CONSOLE_LOG_ENTRIES}; // Inject constant

            const logHandler = (type, args) => {
                 // Attempt to serialize arguments safely
                 const message = Array.from(args).map(arg => {
                    try {
                        if (arg instanceof Element) return '[DOM Element]';
                        if (typeof arg === 'function') return '[Function]';
                        if (arg instanceof Error) return arg.stack || arg.message; // Prefer stack trace
                        // Basic check for circular structures (very rudimentary)
                        if (typeof arg === 'object' && arg !== null) {
                            try {
                                return JSON.stringify(arg);
                            } catch (e) {
                                return '[Potentially Circular Object]';
                            }
                        }
                        return String(arg);
                    } catch (e) {
                        return '[Unserializable Argument]';
                    }
                }).join(' ');

                // Store log entry if limit not reached
                if (window.__collectedLogs.length < MAX_LOGS) {
                     window.__collectedLogs.push({ type: type, message: message, timestamp: new Date().toISOString() });
                } else if (window.__collectedLogs.length === MAX_LOGS) {
                     // Add a single message indicating the limit was hit
                     window.__collectedLogs.push({ type: 'system', message: 'Log limit reached.', timestamp: new Date().toISOString() });
                }
                // Note: The interceptor limit prevents unbounded memory growth in the inspected page.
            };

            // Override console methods
            console.log = function(...args) { logHandler('log', args); originalLog.apply(console, args); };
            console.warn = function(...args) { logHandler('warn', args); originalWarn.apply(console, args); };
            console.error = function(...args) { logHandler('error', args); originalError.apply(console, args); };

            console.log('Lovable Debugger: Console intercept active.'); // Confirmation log

            return window.__collectedLogs; // Return current logs (might be empty initially)
        })();
    `;

    // Execute the script in the inspected window
    chrome.devtools.inspectedWindow.eval(
        scriptToInject,
        function(result, isException) {
            if (isException) {
                console.error("Error injecting console intercept script:", isException);
                consoleOutput.value += "\nError injecting script: " + (isException.value || "Unknown evaluation error");
                statusMessage.textContent = "Error starting console log collection.";
            } else {
                // Script injected successfully
                consoleOutput.value = "Console log interceptor injected. New logs will be captured internally.\nClick 'Generate Prompt' later to retrieve them.";
                statusMessage.textContent = "Console intercept active. Interact with the page.";
                // Set flag indicating we need to retrieve logs from the page later
                consoleLogsNeedRetrieval = true;
            }
        }
    );
}

/**
 * Fetches network activity using the HAR log and generates a summary.
 */
function collectNetworkDataHandler() {
    networkOutput.value = "Collecting network data...";
    statusMessage.textContent = "Fetching network HAR log...";

    chrome.devtools.network.getHAR((harLog) => {
        // **Important:** Check for chrome.runtime.lastError *first*.
        // This indicates an error *within the getHAR call itself*.
        if (chrome.runtime && chrome.runtime.lastError) {
            console.error("Error fetching HAR log (chrome.runtime.lastError):", chrome.runtime.lastError);
            networkOutput.value = "Error fetching HAR log: " + chrome.runtime.lastError.message;
            statusMessage.textContent = "Error collecting network data.";
            collectedNetworkSummary = ""; // Reset summary
            return; // Stop processing
        }

        // Also handle cases where getHAR might succeed but return an invalid harLog object.
        if (!harLog || !harLog.entries) {
            console.error("Failed to get a valid HAR log object, although no specific lastError was reported.");
            networkOutput.value = "Failed to retrieve valid HAR log data.";
            statusMessage.textContent = "Error collecting network data.";
            collectedNetworkSummary = "";
            return;
        }

        // Process the HAR log entries
        let errors = [];
        let slowRequests = [];

        harLog.entries.forEach(entry => {
            // Check for client/server errors (status >= 400)
            if (entry.response.status >= 400) {
                // Truncate long URLs for readability
                const url = entry.request.url;
                const truncatedUrl = url.length > 100 ? url.substring(0, 97) + '...' : url;
                errors.push(`- ${entry.request.method} ${truncatedUrl} (${entry.response.status} ${entry.response.statusText})`);
            }
            // Check for slow requests based on the threshold
            if (entry.time > HAR_SLOW_THRESHOLD_MS) {
                const url = entry.request.url;
                const truncatedUrl = url.length > 100 ? url.substring(0, 97) + '...' : url;
                slowRequests.push(`- ${entry.request.method} ${truncatedUrl} (${entry.time.toFixed(0)}ms)`);
            }
        });

        // Build the summary string
        let summary = `Network Summary (Based on ${harLog.entries.length} requests):\n`;

        if (errors.length > 0) {
            summary += `\nHTTP Errors (>=400) (${errors.length}):\n${errors.slice(0, MAX_NETWORK_ERROR_LINES).join('\n')}`;
            if (errors.length > MAX_NETWORK_ERROR_LINES) summary += `\n(and ${errors.length - MAX_NETWORK_ERROR_LINES} more...)`;
            summary += "\n";
        } else {
            summary += "\nNo significant network errors (>=400) found.\n";
        }

        if (slowRequests.length > 0) {
            summary += `\nSlow Requests (> ${HAR_SLOW_THRESHOLD_MS}ms) (${slowRequests.length}):\n${slowRequests.slice(0, MAX_NETWORK_SLOW_LINES).join('\n')}`;
             if (slowRequests.length > MAX_NETWORK_SLOW_LINES) summary += `\n(and ${slowRequests.length - MAX_NETWORK_SLOW_LINES} more...)`;
             summary += "\n";
        } else {
            summary += "\nNo particularly slow requests found.\n";
        }

        // Update state and UI
        collectedNetworkSummary = summary;
        networkOutput.value = collectedNetworkSummary;
        statusMessage.textContent = "Network data collected and summarized.";
    });
}

/**
 * Clears all collected data and resets the UI.
 */
function clearDataHandler() {
    collectedConsoleLogs = [];
    collectedNetworkSummary = "";
    consoleOutput.value = "";
    networkOutput.value = "";
    generatedPrompt.value = "";
    aiResponseDiv.textContent = "Waiting for analysis..."; // Reset AI response area
    statusMessage.textContent = "Collected data cleared.";
    consoleLogsNeedRetrieval = false; // Reset flag
    checkAiButtonState(); // Update button states
}

// ============================================================================
// Prompt Generation & AI Interaction
// ============================================================================

/**
 * Retrieves captured console logs from the inspected page context.
 * @returns {Promise<Array>} A promise resolving with the array of log objects.
 */
async function retrieveConsoleLogsFromPage() {
    statusMessage.textContent = "Retrieving captured console logs...";
    return new Promise((resolve, reject) => {
        // Evaluate code in the inspected page to get the logs array
        chrome.devtools.inspectedWindow.eval(
            "window.__collectedLogs || []", // Access the array stored by the interceptor
            (evalResult, isException) => {
                if (isException) {
                    console.error("Error retrieving console logs via eval:", isException);
                    statusMessage.textContent = "Error retrieving console logs.";
                    reject(isException); // Reject the promise on error
                } else {
                    statusMessage.textContent = "Console logs retrieved.";
                    resolve(evalResult || []); // Resolve with the result (or empty array)
                }
            }
        );
    });
}

/**
 * Generates the prompt string to send to the Gemini API based on collected data.
 * @param {Array} logs - Array of collected console log objects.
 * @param {string} network - The generated network summary string.
 * @returns {string} The formatted prompt string.
 */
function generateLovablePrompt(logs, network) {
    // Detailed instructions for the AI
    let prompt = `You are an AI debugging assistant specialized in analyzing web application issues using Chrome DevTools data. Analyze the following Console Logs and Network Summary.\n\n`;
    prompt += `Your goal is to:\n`;
    prompt += `1.  Identify potential errors, exceptions, or significant warnings in the logs.\n`;
    prompt += `2.  Correlate logs with network errors (e.g., a console error occurring after a 4xx/5xx request).\n`;
    prompt += `3.  Summarize the most likely underlying problem(s).\n`;
    prompt += `4.  Suggest concrete, actionable next steps for the developer to fix the issue or investigate further. Examples: "Check if the variable 'X' is defined before use in component Y", "Inspect the response body of the failing network request Z", "Add console.log statements in function A to trace the value of B".\n`;
    prompt += `5.  If the data is insufficient, state what additional information or debugging steps would be helpful.\n\n`;
    prompt += `--- CONSOLE LOGS ---\n`;

    if (logs && logs.length > 0) {
        // Format logs and limit length for the prompt
        let logStr = logs.map(log => `[${log.type.toUpperCase()}] ${log.timestamp}: ${log.message}`).join('\n');
        if (logStr.length > MAX_CONSOLE_LOG_CHARS_IN_PROMPT) {
            // Take the end of the logs if too long
            logStr = logStr.substring(logStr.length - MAX_CONSOLE_LOG_CHARS_IN_PROMPT);
            prompt += `(Showing last ~${MAX_CONSOLE_LOG_CHARS_IN_PROMPT} characters of ${logs.length} logs)\n...\n` + logStr;
        } else {
            prompt += logStr;
        }
    } else {
        prompt += "(No significant console logs captured or provided)\n";
    }
    prompt += "\n\n"; // Ensure separation

    prompt += "--- NETWORK SUMMARY ---\n";
    // Check if the network summary contains actual data beyond the header
    if (network && network.trim() !== "Network Summary:" && network.trim() !== "") {
        prompt += network;
    } else {
        prompt += "(No network summary available or collected)\n";
    }
    prompt += "\n\n"; // Ensure separation

    prompt += "--- ANALYSIS REQUEST ---\n";
    prompt += "Please provide your analysis based *only* on the information above, following the goals outlined.\n";

    return prompt;
}

// ===================== WALIDACJA DANYCH WEJŚCIOWYCH =====================

/**
 * Waliduje tekstowy prompt przed wysłaniem do AI.
 * @param {string} prompt
 * @returns {boolean}
 */
function validatePrompt(prompt) {
    if (typeof prompt !== 'string') return false;
    if (prompt.length < 10 || prompt.length > 4000) return false;
    // Możesz dodać dodatkowe reguły (np. zakazane znaki)
    return true;
}

/**
 * Waliduje logi konsoli przed użyciem w promptach.
 * @param {Array} logs
 * @returns {boolean}
 */
function validateLogs(logs) {
    if (!Array.isArray(logs)) return false;
    if (logs.length > MAX_CONSOLE_LOG_ENTRIES) return false;
    for (const log of logs) {
        if (typeof log.message !== 'string' || log.message.length > 1000) return false;
    }
    return true;
}

/**
 * Waliduje odpowiedź AI przed wyświetleniem.
 * @param {string} aiText
 * @returns {boolean}
 */
function validateAiResponse(aiText) {
    if (typeof aiText !== 'string') return false;
    if (aiText.length < 1 || aiText.length > 5000) return false;
    // Możesz dodać dodatkowe reguły (np. zakazane frazy)
    return true;
}

/**
 * Handles the click event for the "Generate Lovable Prompt" button.
 */
async function generatePromptHandler() {
    statusMessage.textContent = "Generating prompt...";
    generatedPrompt.value = "Generating..."; // Placeholder text

    // Retrieve console logs if the interceptor was active
    if (consoleLogsNeedRetrieval) {
        try {
            const logs = await retrieveConsoleLogsFromPage(); // Await the promise
            if (validateLogs(logs)) {
                collectedConsoleLogs = logs; // Update global state
                // Update UI display of console logs
                consoleOutput.value = collectedConsoleLogs.map(log => `[${log.type.toUpperCase()}] ${log.timestamp}: ${log.message}`).join('\n');
            } else {
                consoleOutput.value += "\n(Logi nie przeszły walidacji!)";
                statusMessage.textContent = "Błąd: logi nie przeszły walidacji.";
                return;
            }
        } catch (error) {
            // Error during retrieval is already logged by retrieveConsoleLogsFromPage
            consoleOutput.value += `\nError retrieving logs: ${error.value || error.message || "Unknown eval error"}`;
        }
        // It's generally safe to turn off the need for retrieval after attempting it.
        // consoleLogsNeedRetrieval = false; // Optional: uncomment if you only want one retrieval attempt per injection.
    } else {
        // If not attempting retrieval, ensure console output reflects current state
        if (consoleOutput.value === "") {
            consoleOutput.value = "(No console logs collected or retrieved yet)";
        }
        statusMessage.textContent = "Ready to generate prompt from existing data.";
    }

    // Generate the actual prompt text using the (potentially updated) data
    const promptText = generateLovablePrompt(collectedConsoleLogs, collectedNetworkSummary);
    if (!validatePrompt(promptText)) {
        generatedPrompt.value = "Błąd: prompt nie przeszedł walidacji.";
        statusMessage.textContent = "Błąd: prompt nie przeszedł walidacji.";
        return;
    }
    generatedPrompt.value = promptText; // Display the generated prompt
    statusMessage.textContent = "Prompt generated and ready to send.";
    checkAiButtonState(); // Enable the "Send to AI" button if conditions are met
}

/**
 * Handles the click event for the "Copy Prompt" button.
 */
function copyPromptHandler() {
    const promptText = generatedPrompt.value;
    if (promptText && promptText !== "Generating...") {
        // Use modern clipboard API (requires "clipboardWrite" permission)
        navigator.clipboard.writeText(promptText).then(() => {
            statusMessage.textContent = 'Prompt copied to clipboard!';
            // Provide visual feedback on the button
            const originalText = copyPromptButton.textContent;
            copyPromptButton.textContent = 'Copied!';
            setTimeout(() => { copyPromptButton.textContent = originalText; }, 2000); // Revert after 2s
        }).catch(err => {
            // Handle potential errors (e.g., permission denied, API not supported)
            console.error('Failed to copy prompt using navigator.clipboard:', err);
            statusMessage.textContent = 'Error: Could not copy prompt automatically.';
            // Fallback: Try selecting text for manual copy (less reliable)
            try {
                generatedPrompt.select();
                // document.execCommand('copy'); // Deprecated, avoid if possible
                alert('Could not copy automatically. Please select the text and use Ctrl+C/Cmd+C.');
            } catch (fallbackErr) {
                console.error('Fallback text selection failed:', fallbackErr);
                alert('Could not copy automatically or select text. Please copy manually.');
            }
        });
    } else {
        statusMessage.textContent = 'Generate a prompt first before copying.';
    }
}

/**
 * Handles the click event for the "Send to AI" button. Sends the prompt to Gemini.
 */
async function sendToAiHandler() {
    // Pre-flight checks
    if (!apiKey) {
        statusMessage.textContent = "Error: API Key not set. Save your key first.";
        aiResponseDiv.textContent = "API Key required.";
        return;
    }
    const currentPrompt = generatedPrompt.value;
    if (!validatePrompt(currentPrompt)) {
        statusMessage.textContent = "Błąd: prompt nie przeszedł walidacji.";
        aiResponseDiv.textContent = "Błąd: prompt nie przeszedł walidacji.";
        return;
    }

    // Update UI for loading state
    statusMessage.textContent = `Sending prompt to ${GEMINI_MODEL}...`;
    aiResponseDiv.textContent = "⏳ Contacting AI...";
    sendToAiButton.disabled = true; // Prevent multiple clicks
    copyPromptButton.disabled = true; // Disable copy while request is in flight

    // Construct the full API endpoint URL
    const fullApiUrl = `${API_BASE_URL}${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    console.log("Sending request to:", fullApiUrl); // Log the target URL (without key ideally, but useful for debug)

    try {
        // Make the API call using fetch
        const response = await fetch(fullApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Body structure must match the Gemini API requirements
            body: JSON.stringify({
                // Standard structure for generateContent
                "contents": [{
                    "parts": [{
                        "text": currentPrompt // The prompt text generated earlier
                    }]
                }],
                // Optional: Fine-tune generation parameters
                 "generationConfig": {
                    "temperature": 0.6,       // Lower value = more deterministic/focused
                    "maxOutputTokens": 1500,  // Max length of the response
                    "topP": 0.95,             // Nucleus sampling
                    "topK": 40                // Top-K sampling
                 },
                 // Optional: Configure safety settings if needed
                 // "safetySettings": [ { "category": "HARM_CATEGORY_...", "threshold": "BLOCK_..." } ]
            }),
            // Add a timeout to prevent indefinite hangs
            signal: AbortSignal.timeout(45000) // 45 second timeout
        });

        // Check if the HTTP request itself was successful
        if (!response.ok) {
            // Attempt to parse the error response body for more details
            let errorBody = `Status: ${response.status}. Could not retrieve detailed error message.`;
            try {
                const errorData = await response.json();
                // Format the error nicely if possible
                 errorBody = `API Error: ${response.status} ${response.statusText}\nDetails:\n${JSON.stringify(errorData.error || errorData, null, 2)}`;
            } catch (e) {
                // If parsing fails, try to get raw text
                try { errorBody = `API Error: ${response.status} ${response.statusText}\nResponse Text:\n${await response.text()}`; }
                catch (e2) { /* Ignore secondary error if text also fails */ }
            }
            throw new Error(errorBody); // Throw an error to be caught below
        }

        // Parse the successful JSON response
        const data = await response.json();

        // --- Extract the AI's generated text from the response ---
        const candidate = data?.candidates?.[0]; // Get the first candidate
        let aiText = candidate?.content?.parts?.[0]?.text;

        // Handle cases where the response might be blocked or empty
        if (!aiText) {
             if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                 // Response finished for a reason other than normal completion (e.g., safety block)
                 aiText = `⚠️ AI response generation stopped. Reason: ${candidate.finishReason}`;
                 if(candidate.safetyRatings) {
                    // Include safety ratings if available, provides context for blocks
                    aiText += `\nSafety Ratings: ${JSON.stringify(candidate.safetyRatings)}`;
                 }
             } else {
                // No text content found, and no specific finish reason provided
                aiText = "❓ AI returned an empty response or the structure was unexpected.";
                console.warn("Unexpected AI response structure:", data); // Log for debugging
             }
        }

        // Walidacja odpowiedzi AI
        if (!validateAiResponse(aiText)) {
            aiResponseDiv.textContent = "Błąd: odpowiedź AI nie przeszła walidacji.";
            statusMessage.textContent = "Błąd: odpowiedź AI nie przeszła walidacji.";
            return;
        }

        // Display the AI's analysis
        aiResponseDiv.textContent = aiText;
        statusMessage.textContent = "✅ AI analysis complete.";

    } catch (error) {
        // Handle errors during the fetch call or processing
        console.error("AI API Call Error:", error); // Log the full error
        aiResponseDiv.textContent = `❌ Error contacting AI:\n${error.message}`; // Show error message to user
        // Provide specific status message for timeouts
         if (error.name === 'TimeoutError') {
            statusMessage.textContent = "Error: AI request timed out.";
         } else {
            statusMessage.textContent = "Error during AI analysis.";
         }
    } finally {
        // --- Re-enable buttons regardless of success or failure ---
        checkAiButtonState(); // Re-evaluate based on key/prompt state
        // Ensure copy button is enabled if a prompt exists (even if AI call failed)
        copyPromptButton.disabled = !(generatedPrompt.value.trim().length > 0 && generatedPrompt.value !== "Generating...");
    }
}


// ============================================================================
// Event Listener Setup
// ============================================================================

/**
 * Attaches all necessary event listeners when the panel loads.
 */
function setupEventListeners() {
    saveKeyButton.addEventListener('click', handleSaveApiKey);
    collectConsoleButton.addEventListener('click', collectConsoleLogsHandler);
    collectNetworkButton.addEventListener('click', collectNetworkDataHandler);
    clearDataButton.addEventListener('click', clearDataHandler);
    generatePromptButton.addEventListener('click', generatePromptHandler);
    copyPromptButton.addEventListener('click', copyPromptHandler);
    sendToAiButton.addEventListener('click', sendToAiHandler);
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initializes the panel when the DOM is ready.
 */
function initializePanel() {
    console.log("Lovable AI Debugger Panel Initializing...");
    loadApiKey(); // Load API key from storage first
    setupEventListeners(); // Then setup listeners
    checkAiButtonState(); // Set initial button states
    statusMessage.textContent = "Panel loaded. Enter API key if needed."; // Initial status
}

// Run initialization when the DOM content has loaded
document.addEventListener('DOMContentLoaded', initializePanel);
