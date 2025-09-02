// background.js

let SEARCH_ENGINES = {};
let FAVORITE_ENGINES = new Set();

async function loadEngines() {
    try {
        // Fetch default engines from JSON
        const url = chrome.runtime.getURL('engines.json');
        const response = await fetch(url);
        const defaultEngines = await response.json();

        const engineMap = new Map();
        for (const engine of defaultEngines) {
            if (engine.key && engine.name && engine.url && engine.url.includes('%s')) {
                engineMap.set(engine.key.toLowerCase(), {
                    name: engine.name,
                    url: engine.url
                });
            }
        }

        // Fetch and merge custom engines from storage
        const storageData = await chrome.storage.local.get(['customEngines']);
        const customEngines = storageData.customEngines || {};
        for (const [key, value] of Object.entries(customEngines)) {
            if (key && value.name && value.url && value.url.includes('%s')) {
                engineMap.set(key.toLowerCase(), {
                    name: value.name,
                    url: value.url
                });
            }
        }

        SEARCH_ENGINES = Object.fromEntries(engineMap);
        console.log("Omniscan: All engines loaded successfully.");
    } catch (error) {
        console.error("Omniscan: Failed to load engines:", error);
    }
}

const loadFavorites = async() => {
    if (!chrome.storage || !chrome.storage.local) {
        console.error("Omniscan: Storage API is not available.");
        return;
    }
    const result = await chrome.storage.local.get(['favorites']);
    if (result.favorites) {
        FAVORITE_ENGINES = new Set(result.favorites);
    }
};

// --- Initial Loading & Listeners ---
(async() => {
    await loadEngines();
    await loadFavorites();
})();

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.favorites) {
            FAVORITE_ENGINES = new Set(changes.favorites.newValue || []);
            console.log("Omniscan: Favorites updated in background.");
        }
        if (changes.customEngines) {
            console.log("Omniscan: Custom engines updated, reloading all engines.");
            loadEngines();
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    loadEngines();
    loadFavorites();
});

chrome.runtime.onStartup.addListener(() => {
    loadEngines();
    loadFavorites();
});

// --- Omnibox Event Listeners ---

chrome.omnibox.setDefaultSuggestion({
    description: chrome.i18n.getMessage("omniboxDefaultSuggestion")
});

/**
 * Handles real-time suggestions as the user types in the omnibox.
 */
chrome.omnibox.onInputChanged.addListener(async(text, suggest) => {
    if (Object.keys(SEARCH_ENGINES).length === 0) {
        await loadEngines();
    }
    if (FAVORITE_ENGINES.size === 0) {
        await loadFavorites();
    }

    const trimmedText = text.trim();
    let suggestions = [];

    // Case 0: User just typed "scan" and a space. Show favorites.
    if (trimmedText === '') {
        if (FAVORITE_ENGINES.size > 0) {
            FAVORITE_ENGINES.forEach(key => {
                if (SEARCH_ENGINES[key]) {
                    const engine = SEARCH_ENGINES[key];
                    suggestions.push({
                        content: `${key} `,
                        description: `★ Search <match>${key}</match> (<dim>${engine.name}</dim>)`
                    });
                }
            });
        }
        suggest(suggestions);
        return;
    }

    const args = trimmedText.split(/\s+/);
    const lowerCaseFirstArg = args[0].toLowerCase();

    // Case 1: "scan <known_ticker> <address_part...>"
    if (args.length >= 2 && SEARCH_ENGINES[lowerCaseFirstArg]) {
        const engine = SEARCH_ENGINES[lowerCaseFirstArg];
        const queryPart = args.slice(1).join(' ');
        const isFavorited = FAVORITE_ENGINES.has(lowerCaseFirstArg);
        const description = chrome.i18n.getMessage("omniboxSuggestionDescription", [engine.name, queryPart]);

        suggestions.push({
            content: text,
            description: (isFavorited ? '★ ' : '') + description
        });
    }
    // Case 2: User is typing a single argument (ticker or name).
    else if (args.length === 1) {
        // Subcase 2.1: It could be an address for Debank.
        if (lowerCaseFirstArg.length >= 8) {
            const debankEngine = SEARCH_ENGINES['deb'];
            if (debankEngine) {
                const isFavorited = FAVORITE_ENGINES.has('deb');
                const description = chrome.i18n.getMessage("omniboxSuggestionDescription", [debankEngine.name, lowerCaseFirstArg]);
                suggestions.push({
                    content: text,
                    description: (isFavorited ? '★ ' : '') + description
                });
            }
        }

        // Subcase 2.2: It could be a ticker or name being typed.
        // Find all engines where the key OR name matches the input.
        const matchingEngines = Object.entries(SEARCH_ENGINES).filter(([key, engine]) =>
                key.startsWith(lowerCaseFirstArg) ||
                engine.name.toLowerCase().includes(lowerCaseFirstArg));

        const favoriteSuggestions = [];
        const otherSuggestions = [];

        matchingEngines.forEach(([key, engine]) => {
            const suggestion = {
                content: `${key} `, // Set content to the ticker for the next step
                description: `Search <match>${key}</match> (<dim>${engine.name}</dim>)`
            };
            if (FAVORITE_ENGINES.has(key)) {
                suggestion.description = `★ ${suggestion.description}`;
                favoriteSuggestions.push(suggestion);
            } else {
                otherSuggestions.push(suggestion);
            }
        });

        suggestions.push(...favoriteSuggestions, ...otherSuggestions);
    }

    suggest(suggestions);
});

/**
 * Handles the final search when the user presses Enter.
 */
chrome.omnibox.onInputEntered.addListener(async(text, disposition) => {
    if (Object.keys(SEARCH_ENGINES).length === 0) {
        await loadEngines();
    }

    const args = text.trim().split(/\s+/).filter(p => p.length > 0);
    const solanaTxRegex = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/; // Solana hashes are typically longer

    if (args.length === 0)
        return;

    let ticker;
    let query;

    // Requirement 0: Make search case-insensitive.
    const potentialTicker = args[0].toLowerCase();

    // Case 1: "scan <ticker/name> <address...>"
    if (args.length >= 2) {
        const potentialQuery = args.slice(1).join(' ');

        // First, check for an exact ticker match.
        if (SEARCH_ENGINES[potentialTicker]) {
            ticker = potentialTicker;
        } else {
            // If no exact match, search for a unique partial or name match.
            const matchingEngines = Object.entries(SEARCH_ENGINES).filter(([key, engine]) => {
                const lowerName = engine.name.toLowerCase();
                const lowerNameNoSpace = lowerName.replace(/\s+/g, '');

                // Requirement 1: Match full name without spaces.
                if (lowerNameNoSpace === potentialTicker)
                    return true;
                // Requirement 2: Match partial ticker or name.
                if (key.includes(potentialTicker) || lowerName.includes(potentialTicker))
                    return true;

                return false;
            });

            // If there's only one unique result, set it as the ticker.
            if (matchingEngines.length === 1) {
                ticker = matchingEngines[0][0];
            }
        }
        query = potentialQuery;
    }
    // Case 2: "scan <address>"
    else if (args.length === 1) {
        const input = args[0];

        // Define Regex for various address, transaction hash, and name service types
        const ensRegex = /\.eth$/;
        const nearRegex = /\.near$/;
        // This general-purpose regex matches 66-character hex strings (0x + 64 chars).
        // It covers EVM transaction hashes as well as Move-based addresses (Sui, Aptos).
        // OKLink is a multi-chain explorer that can handle all of these formats.
        const longHexRegex = /^0x[a-fA-F0-9]{64}$/;
        const btcTxRegex = /^[a-fA-F0-9]{64}$/;
        const btcAddressRegex = /^(bc1p|bc1q|[13])[a-km-zA-HJ-NP-Z1-9]{25,90}$/;
        const solAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        const cosmosAddressRegex = /^(cosmos|osmo|tia|sei|inj|kava|akt|rune)1[a-z0-9]+$/;
        const cosmosMatch = input.match(cosmosAddressRegex);
        const xrpAddressRegex = /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/;
        const cardanoAddressRegex = /^addr1[a-z0-9]+$/;
        const stellarAddressRegex = /^G[A-Z0-9]{55}$/;
        const tezosAddressRegex = /^(tz1|tz2|tz3)[a-zA-Z0-9]{33}$/;
        const bchAddressRegex = /^(bitcoincash:)?(q|p)[a-z0-9]{41}$/;

        // Detection order is important: more specific patterns must come before general ones.
        if (ensRegex.test(input)) {
            ticker = 'eth'; // ENS domain -> Etherscan
        } else if (nearRegex.test(input)) {
            ticker = 'near'; // NEAR Protocol -> NEAR Explorer
        } else if (longHexRegex.test(input)) {
            ticker = 'oklink'; // EVM Tx Hash or Move Address (Sui, Aptos) -> OKLink
        } else if (xrpAddressRegex.test(input)) {
            ticker = 'xrp'; // XRP Address -> XRP Scan
        } else if (cardanoAddressRegex.test(input)) {
            ticker = 'ada'; // Cardano Address -> CardanoScan
        } else if (stellarAddressRegex.test(input)) {
            ticker = 'xlm'; // Stellar Address -> Stellar Expert
        } else if (tezosAddressRegex.test(input)) {
            ticker = 'xtz'; // Tezos Address -> tzkt
        } else if (bchAddressRegex.test(input)) {
            ticker = 'bch'; // Bitcoin Cash Address -> Blockchair
        } else if (solanaTxRegex.test(input)) {
            ticker = 'sol'; // Solana Tx -> Solscan
        } else if (btcAddressRegex.test(input)) {
            ticker = 'btc'; // Bitcoin Address -> Bitcoin Explorer
        } else if (solAddressRegex.test(input)) {
            ticker = 'sol'; // Solana Address -> Solscan
        } else if (cosmosMatch) {
            // Map the matched address prefix to the correct engine ticker
            const prefix = cosmosMatch[1];
            const prefixTickerMap = {
                'cosmos': 'atom',
                'tia': 'tia',
                'sei': 'sei',
                'inj': 'inj',
                'osmo': 'osmo',
                'kava': 'kava',
                'akt': 'akt',
                'rune': 'rune'
            };
            ticker = prefixTickerMap[prefix];
        } else if (btcTxRegex.test(input)) {
            ticker = 'btc'; // Bitcoin Tx -> Bitcoin Explorer
        } else {
            ticker = 'deb'; // Default to DeBank for everything else (like EVM addresses)
        }
        // --- End of new/modified code ---
        query = input;
    }

    // If no matching engine is found, do nothing.
    if (!ticker) {
        return;
    }

    const engine = SEARCH_ENGINES[ticker];

    if (engine && query) {
        let searchUrl;

        // Special handling for Solana to route addresses and txs correctly
        if (ticker === 'sol') {
            if (solanaTxRegex.test(query)) {
                // It's a transaction, use the /tx/ path
                searchUrl = `https://solscan.io/tx/${encodeURIComponent(query)}`;
            } else {
                // It's an address, use the default URL from engines.json
                searchUrl = engine.url.replace('%s', encodeURIComponent(query));
            }
        } else {
            // For all other engines, use the default behavior
            searchUrl = engine.url.replace('%s', encodeURIComponent(query));
        }

        // Add URL protocol validation as a defense-in-depth measure
        if (!searchUrl.startsWith('https:') && !searchUrl.startsWith('http:')) {
            console.error(`Omniscan: Blocked potentially unsafe URL: ${searchUrl}`);
            return; // Abort navigation
        }

        const tabProperties = {
            url: searchUrl
        };
        if (disposition === 'newForegroundTab') {
            chrome.tabs.create({
                ...tabProperties,
                active: true
            });
        } else if (disposition === 'newBackgroundTab') {
            chrome.tabs.create({
                ...tabProperties,
                active: false
            });
        } else { // currentTab
            chrome.tabs.update(tabProperties);
        }
    }
});
