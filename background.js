// background.js

let SEARCH_ENGINES = {};
let FAVORITE_ENGINES = new Set();

/**
 * Loads the search engine configuration from engines.json.
 */
async function loadEngines() {
    if (Object.keys(SEARCH_ENGINES).length > 0)
        return;

    try {
        const url = chrome.runtime.getURL('engines.json');
        const response = await fetch(url);
        const data = await response.json();
        const engineMap = new Map();
        for (const engine of data) {
            // Validate required fields and URL placeholder.
            if (!engine.key || !engine.name || !engine.url) {
                console.warn("Omniscan: Skipping invalid engine entry missing required fields:", engine);
                continue;
            }

            if (!engine.url.includes('%s')) {
                console.warn("Omniscan: Skipping engine with invalid URL (missing %s placeholder):", engine);
                continue;
            }

            const key = engine.key.toLowerCase();
            if (!engineMap.has(key)) {
                // Store tickers in lowercase for case-insensitive matching.
                engineMap.set(key, {
                    name: engine.name,
                    url: engine.url
                });
            }
        }
        SEARCH_ENGINES = Object.fromEntries(engineMap);
        console.log("Omniscan: Search engines loaded successfully.");
    } catch (error) {
        console.error("Omniscan: Failed to load search engines:", error);
    }
}

/**
 * Load favorites from chrome.storage.
 */
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

// --- Initial Loading ---
(async() => {
    await loadEngines();
    await loadFavorites();
})();

// --- Event Listeners ---

// Listen for changes in storage to keep favorites up-to-date.
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.favorites) {
        FAVORITE_ENGINES = new Set(changes.favorites.newValue || []);
        console.log("Omniscan: Favorites updated in background.");
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
    // Case 2: "scan <address>" (defaults to debank)
    else if (args.length === 1) {
        ticker = 'deb';
        query = args[0];
    }

    // If no matching engine is found, do nothing.
    if (!ticker) {
        return;
    }

    const engine = SEARCH_ENGINES[ticker];

    if (engine && query) {
        let searchUrl = engine.url.replace('%s', encodeURIComponent(query));

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
