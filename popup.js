// popup.js

document.addEventListener('DOMContentLoaded', async() => {
    // --- DOM Elements ---
    const mainView = document.getElementById('main-view');
    const historyView = document.getElementById('history-view');
    const searchInputElement = document.getElementById('searchInput');
    const listElement = document.getElementById('engine-list');
    const modalElement = document.getElementById('engine-modal');
    const modalTitleElement = document.getElementById('modal-title');
    const engineForm = document.getElementById('engine-form');
    const keyInput = document.getElementById('engine-key');
    const nameInput = document.getElementById('engine-name');
    const urlInput = document.getElementById('engine-url');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const addEngineBtn = document.getElementById('add-engine-btn');
    const resetBtn = document.getElementById('reset-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const historyBtn = document.getElementById('history-btn');
    const backBtn = document.getElementById('back-btn');
    const historyListElement = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    let allEngines = [];
    let customEngines = {};
    let favoriteEngines = new Set();
    let searchHistory = [];
    let isEditing = false;
    let originalKey = '';

    // --- Data Management ---

    const loadData = async() => {
        // Loads favorites, custom engines, and search history from chrome.storage.
        if (!chrome.storage || !chrome.storage.local) {
            console.error("Omniscan: Storage API is not available.");
            return;
        }
        const result = await chrome.storage.local.get(['favorites', 'customEngines', 'searchHistory']);
        favoriteEngines = new Set(result.favorites || []);
        customEngines = result.customEngines || {};
        searchHistory = result.searchHistory || [];
    };

    const saveData = async() => {
        // Saves favorites and custom engines to chrome.storage.
        if (!chrome.storage || !chrome.storage.local)
            return;
        await chrome.storage.local.set({
            favorites: Array.from(favoriteEngines),
            customEngines: customEngines,
        });
    };

    const toggleFavorite = async(engineKey) => {
        // Toggles an engine's favorite status and saves it.
        if (favoriteEngines.has(engineKey)) {
            favoriteEngines.delete(engineKey);
        } else {
            favoriteEngines.add(engineKey);
        }
        await chrome.storage.local.set({
            favorites: Array.from(favoriteEngines)
        });
        renderEngineList(getCombinedEngines());
    };

    // --- UI Rendering ---

    const getCombinedEngines = () => {
        // Merges default and custom engines for rendering.
        const mergedEngines = allEngines.map(engine => {
            if (customEngines[engine.key]) {
                return {
                    ...engine,
                    ...customEngines[engine.key],
                    isCustomized: true
                };
            }
            return engine;
        });
        const newCustomEngines = Object.entries(customEngines)
            .filter(([key]) => !allEngines.some(e => e.key === key))
            .map(([key, value]) => ({
                    key,
                    ...value,
                    isCustom: true
                }));
        return [...mergedEngines, ...newCustomEngines];
    };

    const renderEngineList = (enginesToRender) => {
        // Renders the list of search engines based on the current filter and favorites.
        const searchTerm = searchInputElement.value.toLowerCase().trim();
        const filteredList = searchTerm ?
            enginesToRender.filter(e => e.key.toLowerCase().includes(searchTerm) || e.name.toLowerCase().includes(searchTerm)) :
            enginesToRender;

        const favorites = filteredList.filter(e => favoriteEngines.has(e.key));
        const nonFavorites = filteredList.filter(e => !favoriteEngines.has(e.key));

        listElement.innerHTML = '';
        [...favorites, ...nonFavorites].forEach(engine => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <div class="engine-details" data-url="${engine.url}">
                    <code>${engine.key}</code>
                    <span class="engine-name">${engine.name}</span>
                </div>
                <div class="engine-actions">
                    <span class="edit-btn ${engine.isCustomized ? 'modified' : ''}" title="${chrome.i18n.getMessage('editEngineTooltip')}">${engine.isCustom ? '&#128221;' : '&#9998;'}</span>
                    <span class="favorite-star ${favoriteEngines.has(engine.key) ? 'favorited' : ''}" title="${chrome.i18n.getMessage('favoriteEngineTooltip')}">★</span>
                </div>`;

            listItem.querySelector('.engine-details').addEventListener('click', () => {
                try {
                    const homepage = new URL(engine.url).origin;
                    chrome.tabs.create({
                        url: homepage,
                        active: true
                    });
                } catch (e) {
                    console.error("Invalid URL:", e);
                }
            });
            listItem.querySelector('.edit-btn').addEventListener('click', () => openModal(true, engine));
            listItem.querySelector('.favorite-star').addEventListener('click', () => toggleFavorite(engine.key));
            listElement.appendChild(listItem);
        });
    };

    const formatHistoryItem = (text) => {
        // Formats the search text for display (e.g., 'arb 0x123...abc').
        const parts = text.trim().split(/\s+/);
        if (parts.length > 1) {
            const lastPart = parts[parts.length - 1];
            if (lastPart.length > 12) {
                const shortened = `${lastPart.slice(0, 6)}..${lastPart.slice(-6)}`;
                return `${parts.slice(0, -1).join(' ')} ${shortened}`;
            }
        } else if (parts.length === 1 && parts[0].length > 12) {
            const item = parts[0];
            return `${item.slice(0, 6)}..${item.slice(-6)}`;
        }
        return text;
    };

    const renderHistoryList = () => {
        // Renders the search history list.
        historyListElement.innerHTML = '';
        if (searchHistory.length === 0) {
            historyListElement.innerHTML = `<li style="justify-content: center;">${chrome.i18n.getMessage('noHistory')}</li>`;
            return;
        }

        searchHistory.forEach(item => {
            const li = document.createElement('li');
            li.dataset.fullText = item; // Store the original text
            li.innerHTML = `<span class="history-item-text">${formatHistoryItem(item)}</span>`;
            li.addEventListener('click', () => {
                // Send a message to the background script to execute the search
                chrome.runtime.sendMessage({
                    action: "executeSearch",
                    searchText: item
                });
                window.close(); // Close the popup
            });
            historyListElement.appendChild(li);
        });
    };

    // --- View Switching ---
    const showMainView = () => {
        historyView.style.display = 'none';
        mainView.style.display = 'block';
    };

    const showHistoryView = async() => {
        await loadData(); // Always get the latest history
        renderHistoryList();
        mainView.style.display = 'none';
        historyView.style.display = 'block';
    };

    // --- Modal Logic ---

    const validateUrl = () => {
        // Validates the URL input in the modal.
        const urlValue = urlInput.value;
        let isValid = false;
        if (urlValue.includes('%s')) {
            try {
                const url = new URL(urlValue.replace('%s', 'test'));
                if (['http:', 'https:'].includes(url.protocol)) {
                    isValid = true;
                }
            } catch (e) { /* Invalid URL */
            }
        }
        saveBtn.disabled = !isValid;
    };

    const openModal = (editing = false, engine = {}) => {
        // Opens the add/edit engine modal.
        isEditing = editing;
        originalKey = engine.key || '';
        modalTitleElement.textContent = chrome.i18n.getMessage(isEditing ? 'modalTitleEdit' : 'modalTitleAdd');
        keyInput.value = engine.key || '';
        nameInput.value = engine.name || '';
        urlInput.value = engine.url || '';
        keyInput.disabled = isEditing;

        const isDefaultEngine = allEngines.some(e => e.key === originalKey);
        resetBtn.style.display = (isEditing && isDefaultEngine && customEngines[originalKey]) ? 'block' : 'none';
        deleteBtn.style.display = (isEditing && !isDefaultEngine) ? 'block' : 'none';

        modalElement.style.display = 'flex';
        validateUrl();
    };

    const closeModal = () => {
        // Closes the modal.
        engineForm.reset();
        modalElement.style.display = 'none';
    };

    const handleFormSubmit = async(event) => {
        // Handles saving a new or edited engine.
        event.preventDefault();
        const newKey = keyInput.value.toLowerCase().trim();
        if (!newKey)
            return;
        if (!isEditing && getCombinedEngines().some(e => e.key === newKey)) {
            alert(chrome.i18n.getMessage('alertTickerExists', newKey));
            return;
        }
        customEngines[newKey] = {
            name: nameInput.value.trim(),
            url: urlInput.value.trim()
        };
        await saveData();
        renderEngineList(getCombinedEngines());
        closeModal();
    };

    const handleReset = async() => {
        // Resets a modified default engine.
        if (customEngines[originalKey]) {
            delete customEngines[originalKey];
            await saveData();
            renderEngineList(getCombinedEngines());
            closeModal();
        }
    };

    const handleDelete = async() => {
        // Deletes a custom engine.
        if (confirm(chrome.i18n.getMessage('confirmDeleteMessage', originalKey))) {
            if (customEngines[originalKey])
                delete customEngines[originalKey];
            if (favoriteEngines.has(originalKey))
                favoriteEngines.delete(originalKey);
            await saveData();
            renderEngineList(getCombinedEngines());
            closeModal();
        }
    };

    const handleClearHistory = async() => {
        // Clears the entire search history.
        searchHistory = [];
        await chrome.storage.local.set({
            searchHistory: []
        });
        renderHistoryList();
    };

    // --- Main Initialization & Localization ---

    const localizePage = () => {
        // Applies localized strings to the UI.
        document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = chrome.i18n.getMessage(el.dataset.i18n));
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = chrome.i18n.getMessage(el.dataset.i18nPlaceholder));
        document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = chrome.i18n.getMessage(el.dataset.i18nTitle));
        document.getElementById('popupDescription').innerHTML = chrome.i18n.getMessage("popupDescription");
    };

    const init = async() => {
        // Main function to initialize the popup.
        localizePage();
        await loadData();
        try {
            const url = chrome.runtime.getURL('engines.json');
            const response = await fetch(url);
            allEngines = await response.json();
        } catch (error) {
            console.error("Omniscan: Failed to load engines.json", error);
            listElement.innerHTML = `<li>Error loading search engines.</li>`;
            return;
        }
        renderEngineList(getCombinedEngines());

        // --- Event Listeners ---
        searchInputElement.addEventListener('input', () => renderEngineList(getCombinedEngines()));
        addEngineBtn.addEventListener('click', () => openModal(false));
        cancelBtn.addEventListener('click', closeModal);
        resetBtn.addEventListener('click', handleReset);
        deleteBtn.addEventListener('click', handleDelete);
        engineForm.addEventListener('submit', handleFormSubmit);
        urlInput.addEventListener('input', validateUrl);
        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement)
                closeModal();
        });

        historyBtn.addEventListener('click', showHistoryView);
        backBtn.addEventListener('click', showMainView);
        clearHistoryBtn.addEventListener('click', handleClearHistory);
    };

    init();
});
