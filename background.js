// background.js

let SEARCH_ENGINES = {};
let FAVORITE_ENGINES = new Set();
let searchHistory = []; // To keep an in-memory copy

async function loadEngines() {
    // Fetches and loads all search engines (default + custom) into SEARCH_ENGINES.
    try {
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

const loadDataFromStorage = async() => {
    // Loads favorites and search history from chrome.storage.
    if (!chrome.storage || !chrome.storage.local) {
        console.error("Omniscan: Storage API is not available.");
        return;
    }
    const result = await chrome.storage.local.get(['favorites', 'searchHistory']);
    FAVORITE_ENGINES = new Set(result.favorites || []);
    searchHistory = result.searchHistory || [];
};

const addSearchHistory = async(term) => {
    // Adds a new term to the search history, ensuring no duplicates and capping at 20 items.
    if (!term)
        return;
    searchHistory.unshift(term);
    searchHistory = [...new Set(searchHistory)];
    if (searchHistory.length > 20) {
        searchHistory.length = 20;
    }
    await chrome.storage.local.set({
        searchHistory: searchHistory
    });
};

const executeSearch = (text, disposition) => {
    // Core logic to parse a search text and open the correct explorer URL.
    const args = text.trim().split(/\s+/).filter(p => p.length > 0);
    if (args.length === 0)
        return;

    const solanaTxRegex = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
    let ticker;
    let query;
    const potentialTicker = args[0].toLowerCase();

    if (args.length >= 2) {
        const potentialQuery = args.slice(1).join(' ');
        if (SEARCH_ENGINES[potentialTicker]) {
            ticker = potentialTicker;
        } else {
            const matchingEngines = Object.entries(SEARCH_ENGINES).filter(([key, engine]) =>
                    key.includes(potentialTicker) || engine.name.toLowerCase().includes(potentialTicker) || engine.name.toLowerCase().replace(/\s+/g, '') === potentialTicker);
            if (matchingEngines.length === 1) {
                ticker = matchingEngines[0][0];
            }
        }
        query = potentialQuery;
    } else if (args.length === 1) {
        const input = args[0];
        const ensRegex = /\.eth$/;
        const nearRegex = /\.near$/;
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

        if (ensRegex.test(input))
            ticker = 'eth';
        else if (nearRegex.test(input))
            ticker = 'near';
        else if (longHexRegex.test(input))
            ticker = 'oklink';
        else if (xrpAddressRegex.test(input))
            ticker = 'xrp';
        else if (cardanoAddressRegex.test(input))
            ticker = 'ada';
        else if (stellarAddressRegex.test(input))
            ticker = 'xlm';
        else if (tezosAddressRegex.test(input))
            ticker = 'xtz';
        else if (bchAddressRegex.test(input))
            ticker = 'bch';
        else if (solanaTxRegex.test(input))
            ticker = 'sol';
        else if (btcAddressRegex.test(input))
            ticker = 'btc';
        else if (solAddressRegex.test(input))
            ticker = 'sol';
        else if (cosmosMatch) {
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
        } else if (btcTxRegex.test(input))
            ticker = 'btc';
        else
            ticker = 'deb';
        query = input;
    }

    if (!ticker)
        return;

    const engine = SEARCH_ENGINES[ticker];
    if (engine && query) {
        let searchUrl;
        if (ticker === 'sol' && solanaTxRegex.test(query)) {
            searchUrl = `https://solscan.io/tx/${encodeURIComponent(query)}`;
        } else {
            searchUrl = engine.url.replace('%s', encodeURIComponent(query));
        }

        if (!searchUrl.startsWith('https:') && !searchUrl.startsWith('http:')) {
            console.error(`Omniscan: Blocked potentially unsafe URL: ${searchUrl}`);
            return;
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
};

// --- Initial Loading & Listeners ---
(async() => {
    await loadEngines();
    await loadDataFromStorage();
})();

chrome.storage.onChanged.addListener((changes, namespace) => {
    // Updates in-memory data when storage changes.
    if (namespace === 'local') {
        if (changes.favorites) {
            FAVORITE_ENGINES = new Set(changes.favorites.newValue || []);
        }
        if (changes.customEngines) {
            loadEngines();
        }
        if (changes.searchHistory) {
            searchHistory = changes.searchHistory.newValue || [];
        }
    }
});

chrome.runtime.onInstalled.addListener(() => {
    loadEngines();
    loadDataFromStorage();
});

chrome.runtime.onStartup.addListener(() => {
    loadEngines();
    loadDataFromStorage();
});

// --- Message Listener for re-executing search from popup ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "executeSearch" && request.searchText) {
        executeSearch(request.searchText, 'newForegroundTab'); // Always open in a new tab from history
    }
});

// --- Omnibox Event Listeners ---
chrome.omnibox.setDefaultSuggestion({
    description: chrome.i18n.getMessage("omniboxDefaultSuggestion")
});

chrome.omnibox.onInputChanged.addListener(async(text, suggest) => {
    // Handles real-time suggestions as the user types in the omnibox.
    if (Object.keys(SEARCH_ENGINES).length === 0)
        await loadEngines();
    if (FAVORITE_ENGINES.size === 0)
        await loadDataFromStorage();

    const trimmedText = text.trim();
    let suggestions = [];
    const args = trimmedText.split(/\s+/);
    const lowerCaseFirstArg = args[0].toLowerCase();

    if (trimmedText === '') {
        FAVORITE_ENGINES.forEach(key => {
            if (SEARCH_ENGINES[key]) {
                suggestions.push({
                    content: `${key} `,
                    description: `★ Search <match>${key}</match> (<dim>${SEARCH_ENGINES[key].name}</dim>)`
                });
            }
        });
    } else if (args.length >= 2 && SEARCH_ENGINES[lowerCaseFirstArg]) {
        const engine = SEARCH_ENGINES[lowerCaseFirstArg];
        const queryPart = args.slice(1).join(' ');
        const isFavorited = FAVORITE_ENGINES.has(lowerCaseFirstArg);
        const description = chrome.i18n.getMessage("omniboxSuggestionDescription", [engine.name, queryPart]);
        suggestions.push({
            content: text,
            description: (isFavorited ? '★ ' : '') + description
        });
    } else if (args.length === 1) {
        if (lowerCaseFirstArg.length >= 8 && SEARCH_ENGINES['deb']) {
            const isFavorited = FAVORITE_ENGINES.has('deb');
            const description = chrome.i18n.getMessage("omniboxSuggestionDescription", [SEARCH_ENGINES['deb'].name, lowerCaseFirstArg]);
            suggestions.push({
                content: text,
                description: (isFavorited ? '★ ' : '') + description
            });
        }
        const matchingEngines = Object.entries(SEARCH_ENGINES).filter(([key, engine]) =>
                key.startsWith(lowerCaseFirstArg) || engine.name.toLowerCase().includes(lowerCaseFirstArg));
        const favoriteSuggestions = [];
        const otherSuggestions = [];
        matchingEngines.forEach(([key, engine]) => {
            const suggestion = {
                content: `${key} `,
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

chrome.omnibox.onInputEntered.addListener(async(text, disposition) => {
    // Handles the final search when the user presses Enter.
    if (Object.keys(SEARCH_ENGINES).length === 0)
        await loadEngines();
    const trimmedText = text.trim();
    if (!trimmedText)
        return;

    await addSearchHistory(trimmedText);
    executeSearch(trimmedText, disposition);
});
