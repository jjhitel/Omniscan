# Omniscan

![Omniscan Icon](public/images/icon128.png)

Omniscan is a powerful Chrome extension that allows you to instantly search various blockchain explorers directly from your browser's address bar. It's designed to be a lightweight, open-source tool that respects your privacy.

## Features

* **Quick Address Bar Search**: Simply type `scan` into your address bar, followed by a chain ticker and an address or transaction hash. For example, use `scan eth 0x...` to search Etherscan.
* **Intelligent Suggestions**: As you type, Omniscan provides real-time suggestions based on known chain tickers and names, helping you find the right explorer faster.
* **Search History**: Your omnibox searches are automatically saved. You can view your recent searches and re-execute them with a single click from the popup.
* **Custom Engine**: You can personally add or modify engines.
* **Wide Explorer Support**: The extension comes pre-configured with a large list of popular blockchain explorers, from Ethereum and Bitcoin to Solana and Polygon.
* **Open-Source & No Permissions**: Omniscan operates without requiring any special permissions, ensuring a secure and privacy-friendly experience. It is licensed under the **GNU General Public License Version 3**. You can audit the code and build it yourself to verify its functionality.
* **Multi-language Support**: The extension supports both English and Korean.

## How to Use

1.  Type `scan` in your browser's address bar and press **Space** or **Tab**.
2.  Enter a chain ticker (e.g., `eth`, `btc`, `sol`) followed by the address or transaction hash you want to search.
3.  Press **Enter** to instantly navigate to the search results on the corresponding blockchain explorer.

### Examples

* `scan eth 0x...` (Searches Etherscan)
* `scan btc bc1q...` (Searches Blockchain.com for Bitcoin)
* `scan sol ...` (Searches Solscan)

If you just type an address or hash without a ticker, Omniscan will try to send it to the correct explorer automatically. For generic formats like EVM addresses, it defaults to searching **DeBank**.

## Supported Explorers

You can view the full list of supported explorers by clicking the extension's icon in your toolbar and searching the popup menu. This list is sourced from `public/assets/engines.json`.

---

## Installation

Omniscan can be installed directly from the Chrome Web Store.

[![Available in the Chrome Web Store](https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-bcb82d15b2486.png)](https://chromewebstore.google.com/detail/omniscan/dpjaghedbipmpknabndchohlfjpbhinc)

## Building from Source

This project uses **Vite** for its build system.

### Prerequisites

* [Node.js](https://nodejs.org/) (version 18 or higher recommended)
* [npm](https://www.npmjs.com/)

### Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/jjhitel/Omniscan
    cd Omniscan
    ```

2.  Install the dependencies:
    ```bash
    npm install
    ```

### Development

To run the extension in development mode with hot-reloading:

```bash
npm run dev
