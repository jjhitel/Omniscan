// background.js

let SEARCH_ENGINES = {};

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
            if (!engineMap.has(engine.key)) {
                engineMap.set(engine.key, {
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

// Load engines on install or startup.
chrome.runtime.onInstalled.addListener(loadEngines);
chrome.runtime.onStartup.addListener(loadEngines);

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

    const args = text.trim().split(/\s+/);
    const suggestions = [];

    if (!args[0]) {
        suggest([]);
        return;
    }

    const firstArg = args[0];
    const lowerCaseFirstArg = firstArg.toLowerCase();

    // Case 1: "scan <known_ticker> <address_part...>"
    if (args.length >= 2 && SEARCH_ENGINES[firstArg]) {
        const engine = SEARCH_ENGINES[firstArg];
        const queryPart = args.slice(1).join(' ');
        suggestions.push({
            content: text,
            description: chrome.i18n.getMessage("omniboxSuggestionDescription", [engine.name, queryPart])
        });
    }
    // Case 2: User is typing a single argument (ticker or name).
    else if (args.length === 1) {
        // Subcase 2.1: It could be an address for Debank.
        if (firstArg.length >= 8) {
            const debankEngine = SEARCH_ENGINES['deb'];
            if (debankEngine) {
                suggestions.push({
                    content: text,
                    description: chrome.i18n.getMessage("omniboxSuggestionDescription", [debankEngine.name, firstArg])
                });
            }
        }

        // Subcase 2.2: It could be a ticker or name being typed.
        // Find all engines where the key OR name matches the input.
        const matchingEngines = Object.entries(SEARCH_ENGINES).filter(([key, engine]) =>
                key.startsWith(lowerCaseFirstArg) ||
                engine.name.toLowerCase().includes(lowerCaseFirstArg));

        matchingEngines.forEach(([key, engine]) => {
            suggestions.push({
                content: `${key} `, // Set content to the ticker for the next step
                description: `Search <match>${key}</match> (<dim>${engine.name}</dim>)`
            });
        });
    }

    suggest(suggestions);
});

/**
 * Handles the final search when the user presses Enter.
 */
chrome.omnibox.onInputEntered.addListener(async(text, disposition) => {
    await loadEngines();

    const args = text.trim().split(/\s+/).filter(p => p.length > 0);

    if (args.length === 0)
        return;

    let ticker;
    let query;

    const potentialTicker = args[0];

    // Case 1: "scan <known_ticker> <address...>"
    if (args.length >= 2 && SEARCH_ENGINES[potentialTicker]) {
        ticker = potentialTicker;
        query = args.slice(1).join(' ');
    }
    // Case 2: "scan <address>" (defaults to debank)
    else if (args.length === 1) {
        ticker = 'deb';
        query = args[0];
    }
    // If no pattern matches, do nothing.
    else {
        return;
    }

    const engine = SEARCH_ENGINES[ticker];

    if (engine && query) {
        const searchUrl = engine.url.replace('%s', encodeURIComponent(query));

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
