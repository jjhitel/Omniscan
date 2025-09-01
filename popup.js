// popup.js

document.addEventListener('DOMContentLoaded', async() => {
    // --- DOM Elements ---
    const searchInputElement = document.getElementById('searchInput');
    const listElement = document.getElementById('engine-list');
    let allEngines = [];
    let favoriteEngines = new Set();

    // --- Favorite Management ---

    /**
     * Load favorites from chrome.storage.
     */
    const loadFavorites = async() => {
        // Defensive check to ensure the storage API is available.
        // This error typically happens if the "storage" permission is missing
        // or the extension wasn't reloaded after updating manifest.json.
        if (!chrome.storage || !chrome.storage.local) {
            console.error("Omniscan: Storage API is not available. Ensure 'storage' permission is in manifest.json and reload the extension.");
            return;
        }
        const result = await chrome.storage.local.get(['favorites']);
        if (result.favorites) {
            favoriteEngines = new Set(result.favorites);
        }
    };

    /**
     * Save favorites to chrome.storage.
     */
    const saveFavorites = async() => {
        if (!chrome.storage || !chrome.storage.local) {
            // Error will be logged by loadFavorites, no need to repeat.
            return;
        }
        await chrome.storage.local.set({
            favorites: Array.from(favoriteEngines)
        });
    };

    /**
     * Toggle an engine's favorite status.
     * @param {string} engineKey - The key of the engine to toggle.
     */
    const toggleFavorite = async(engineKey) => {
        if (favoriteEngines.has(engineKey)) {
            favoriteEngines.delete(engineKey);
        } else {
            favoriteEngines.add(engineKey);
        }
        await saveFavorites();
        // Re-render the list with the current search term to reflect the change
        const searchTerm = searchInputElement.value.toLowerCase().trim();
        const filteredEngines = allEngines.filter(engine =>
                engine.key.toLowerCase().includes(searchTerm) ||
                engine.name.toLowerCase().includes(searchTerm));
        renderEngineList(filteredEngines);
    };

    // --- Function to render the list of engines ---
    const renderEngineList = (enginesToRender) => {
        // Separate engines into two lists: favorites and non-favorites.
        const favorites = [];
        const nonFavorites = [];

        for (const engine of enginesToRender) {
            if (favoriteEngines.has(engine.key)) {
                favorites.push(engine);
            } else {
                nonFavorites.push(engine);
            }
        }

        // Sort only the favorites list alphabetically by key.
        favorites.sort((a, b) => a.key.localeCompare(b.key));

        // Combine the sorted favorites with the original-ordered non-favorites.
        const sortedEngines = [...favorites, ...nonFavorites];

        listElement.innerHTML = '';
        for (const engine of sortedEngines) {
            const listItem = document.createElement('li');

            // Container for clickable engine details
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'engine-details';
            detailsDiv.dataset.url = engine.url;

            const codeElement = document.createElement('code');
            codeElement.textContent = engine.key;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'engine-name';
            nameSpan.textContent = engine.name;

            detailsDiv.appendChild(codeElement);
            detailsDiv.appendChild(nameSpan);

            // Favorite star
            const starSpan = document.createElement('span');
            starSpan.className = 'favorite-star';
            starSpan.textContent = '★';
            if (favoriteEngines.has(engine.key)) {
                starSpan.classList.add('favorited');
            }

            // --- Event Listeners ---
            detailsDiv.addEventListener('click', () => {
                const searchUrl = detailsDiv.dataset.url;
                if (searchUrl) {
                    const homepage = new URL(searchUrl).origin;
                    chrome.tabs.create({
                        url: homepage,
                        active: true
                    });
                }
            });

            starSpan.addEventListener('click', () => {
                toggleFavorite(engine.key);
            });

            listItem.appendChild(detailsDiv);
            listItem.appendChild(starSpan);
            listElement.appendChild(listItem);
        }
    };

    // --- Main Initialization Logic ---

    // 1. Localize UI text
    document.getElementById('popupTitle').innerText = "Omniscan";

    // Safely construct the description to avoid innerHTML issues
    const descriptionMsg = chrome.i18n.getMessage("popupDescription");
    const descriptionParts = descriptionMsg.split(/<code>|<\/code>/);
    const descriptionElement = document.getElementById('popupDescription');
    descriptionElement.textContent = descriptionParts[0];
    const codeTag = document.createElement('code');
    codeTag.textContent = 'scan';
    descriptionElement.appendChild(codeTag);
    descriptionElement.append(descriptionParts[2]);

    document.getElementById('popupExample').innerText = chrome.i18n.getMessage("popupExample");
    searchInputElement.placeholder = chrome.i18n.getMessage("searchInputPlaceholder");

    // 2. Load favorites before fetching engines
    await loadFavorites();

    // 3. Fetch engine data from the JSON file
    try {
        const url = chrome.runtime.getURL('engines.json');
        const response = await fetch(url);
        allEngines = await response.json();
    } catch (error) {
        console.error("Omniscan: Failed to load engines.json", error);
        listElement.innerHTML = `<li>Error loading search engines.</li>`;
        return; // Stop execution if the file fails to load
    }

    // 4. Render the initial full list
    renderEngineList(allEngines);

    // 5. Set up search input event listener
    searchInputElement.addEventListener('input', (event) => {
        const searchTerm = event.target.value.toLowerCase().trim();
        const filteredEngines = allEngines.filter(engine =>
                engine.key.toLowerCase().includes(searchTerm) ||
                engine.name.toLowerCase().includes(searchTerm));
        renderEngineList(filteredEngines);
    });
});
