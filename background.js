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
                // Store tickers in lowercase for case-insensitive matching.
                engineMap.set(engine.key.toLowerCase(), {
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
    if (args.length >= 2 && SEARCH_ENGINES[lowerCaseFirstArg]) {
        const engine = SEARCH_ENGINES[lowerCaseFirstArg];
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
