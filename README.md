# ✨ Lovable AI Debug Helper ✨

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome DevTools extension that collects console logs and network activity, then uses the Google Gemini AI to analyze potential issues and suggest solutions, helping you debug web applications faster.

## Problem Solved

Debugging web applications often involves manually sifting through potentially hundreds of console logs and network requests to pinpoint errors or performance bottlenecks. This can be time-consuming and tedious.

Lovable AI Debug Helper aims to streamline this process by leveraging the power of AI to automatically analyze common debugging data and provide a concise summary of potential problems and actionable next steps.

## Features

*   **Custom DevTools Panel:** Adds a dedicated "Lovable AI" panel to your Chrome DevTools.
*   **Data Collection:**
    *   Captures recent **Console Logs** (errors, warnings, logs) occurring after interception starts. *(Note: Capturing pre-existing logs has limitations).*
    *   Fetches a summary of **Network Activity** via HAR, highlighting errors (4xx/5xx) and slow requests.
*   **AI-Powered Analysis:**
    *   Generates a detailed prompt containing the collected debug data.
    *   Sends the prompt to the **Google Gemini API** for analysis.
    *   Displays the AI's response, typically including:
        *   Identification of potential errors.
        *   A summary of the likely underlying issues.
        *   Specific suggestions for fixes or further debugging steps.
*   **Convenience:**
    *   Securely stores your Gemini API key locally (using `chrome.storage.local`).
    *   Allows easy copying of the generated prompt sent to the AI.

## Screenshots

*Include screenshots here to showcase the extension in action!*

*   **[Screenshot of the Lovable AI Panel]**
*   ![lovable-debug-helper1](https://github.com/user-attachments/assets/8c62f20a-c1d4-4fad-a6a8-8d2ac0afc279)
*   **[Screenshot showing the AI Response after analysis]**
*   ![lovable-debug-helper2](https://github.com/user-attachments/assets/f5b93482-1f69-401e-9ada-a7fdb8f9f275)


## Installation

As this extension is not yet published on the Chrome Web Store, you need to load it manually:

1.  **Download:** Download the source code (or clone the repository).
2.  **Unzip:** If downloaded as a ZIP, unzip the file.
3.  **Open Chrome Extensions:** Open Chrome and navigate to `chrome://extensions/`.
4.  **Enable Developer Mode:** Ensure the "Developer mode" toggle in the top-right corner is enabled.
5.  **Load Unpacked:** Click the "Load unpacked" button.
6.  **Select Folder:** Navigate to and select the directory containing the extension's files (the folder with `manifest.json` inside).
7.  The "Lovable AI Debug Helper" extension should now appear in your list of extensions.

## Usage

1.  **Open DevTools:** Navigate to the web page you want to debug and open Chrome DevTools (Right-click -> Inspect, or press F12).
2.  **Select Panel:** Find and click on the "Lovable AI" tab in the DevTools panel bar.
3.  **Configure API Key:**
    *   Obtain a **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey) or Google Cloud Console.
    *   Paste your API key into the designated input field in the extension panel.
    *   Click "Save Key". *(See Configuration section below for security notes)*.
4.  **Collect Data:**
    *   Click "Collect Console Logs" to start intercepting *new* logs.
    *   Click "Collect Network Errors" to get a HAR summary.
    *   Interact with the web page to trigger the behavior you want to debug.
5.  **Generate Prompt:** Click "Generate Lovable Prompt". This prepares the data and instructions for the AI. You can review this in the text area.
6.  **Analyze:** Click "Send to AI". The extension will send the generated prompt to the Gemini API.
7.  **View Results:** The AI's analysis and suggestions will appear in the "AI Response" section.
8.  **Copy (Optional):** Use the "Copy Prompt" button if you need the exact text sent to the AI.

## Configuration

### Gemini API Key

*   This extension **requires** a Google Gemini API Key to function.
*   You can generate a free key suitable for development purposes from [Google AI Studio](https://aistudio.google.com/app/apikey).
*   **Security Warning:** The API key is stored locally on your machine using `chrome.storage.local`. While this is standard practice for extensions, be aware that extensions have access to this storage. Do not use API keys with broad permissions or production quotas for development tools if possible. **Never share your API key or commit it to Git.**

## Technology Stack

*   Chrome Extension Manifest V3
*   JavaScript (ES6+)
*   HTML5
*   CSS3
*   Google Gemini API

## Contributing

This is an open-source project, and contributions are welcome!

*   **Reporting Bugs:** If you find a bug, please open an issue on GitHub detailing the problem, steps to reproduce, and expected behavior.
*   **Suggesting Features:** Have an idea? Open an issue to discuss new features or improvements.
*   **Submitting Changes:**
    1.  Fork the repository.
    2.  Create a new branch (`git checkout -b feature/your-feature-name`).
    3.  Make your changes.
    4.  Commit your changes (`git commit -am 'Add some feature'`).
    5.  Push to the branch (`git push origin feature/your-feature-name`).
    6.  Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

*(You should create a file named `LICENSE` in your repository root and paste the MIT License text into it. You can find the text easily online, e.g., at [opensource.org/licenses/MIT](https://opensource.org/licenses/MIT))*

## `.gitignore`

Make sure you have a `.gitignore` file in your project root to avoid committing sensitive information or unnecessary files. A basic one could include:

```gitignore
# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Dependency directories
node_modules/

# Build output
dist/
build/

# Environment variables file (if used)
.env

# IDE / Editor specific files
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
