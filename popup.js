// popup.js

document.addEventListener('DOMContentLoaded', async() => {
    // --- DOM Elements ---
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

    let allEngines = [];
    let customEngines = {};
    let favoriteEngines = new Set();
    let isEditing = false;
    let originalKey = '';

    // --- Data Management ---

    const loadData = async() => {
        if (!chrome.storage || !chrome.storage.local) {
            console.error("Omniscan: Storage API is not available.");
            return;
        }
        const result = await chrome.storage.local.get(['favorites', 'customEngines']);
        favoriteEngines = new Set(result.favorites || []);
        customEngines = result.customEngines || {};
    };

    const saveData = async() => {
        if (!chrome.storage || !chrome.storage.local)
            return;
        await chrome.storage.local.set({
            favorites: Array.from(favoriteEngines),
            customEngines: customEngines
        });
    };

    const toggleFavorite = async(engineKey) => {
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
        const fullList = enginesToRender.sort((a, b) => a.key.localeCompare(b.key));

        const searchTerm = searchInputElement.value.toLowerCase().trim();
        const filteredList = searchTerm ?
            fullList.filter(engine => engine.key.toLowerCase().includes(searchTerm) || engine.name.toLowerCase().includes(searchTerm)) :
            fullList;

        const favorites = [];
        const nonFavorites = [];
        for (const engine of filteredList) {
            if (favoriteEngines.has(engine.key)) {
                favorites.push(engine);
            } else {
                nonFavorites.push(engine);
            }
        }

        const sortedEngines = [...favorites, ...nonFavorites];
        listElement.innerHTML = '';

        for (const engine of sortedEngines) {
            // 1. Create elements manually instead of using innerHTML
            const listItem = document.createElement('li');

            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'engine-details';
            detailsDiv.dataset.url = engine.url; // Safely set data attribute

            const codeElement = document.createElement('code');
            codeElement.textContent = engine.key; // Use textContent

            const nameSpan = document.createElement('span');
            nameSpan.className = 'engine-name';
            nameSpan.textContent = engine.name; // Use textContent

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'engine-actions';

            const editSpan = document.createElement('span');
            editSpan.className = engine.isCustomized ? 'edit-btn modified' : 'edit-btn';
            editSpan.title = chrome.i18n.getMessage('editEngineTooltip');
            editSpan.innerHTML = engine.isCustom ? '&#128221;' : '&#9998;'; // Icons are safe for innerHTML

            const starSpan = document.createElement('span');
            starSpan.className = 'favorite-star';
            if (favoriteEngines.has(engine.key)) {
                starSpan.classList.add('favorited');
            }
            starSpan.title = chrome.i18n.getMessage('favoriteEngineTooltip');
            starSpan.textContent = '★';

            // 2. Add event listeners
            detailsDiv.addEventListener('click', () => {
                const searchUrl = engine.url;
                if (searchUrl) {
                    try {
                        const homepage = new URL(searchUrl).origin;
                        chrome.tabs.create({
                            url: homepage,
                            active: true
                        });
                    } catch (e) {
                        console.error("Invalid URL for engine:", engine.key, e);
                    }
                }
            });
            editSpan.addEventListener('click', () => openModal(true, engine));
            starSpan.addEventListener('click', () => toggleFavorite(engine.key));

            // 3. Append elements to build the structure
            detailsDiv.appendChild(codeElement);
            detailsDiv.appendChild(nameSpan);
            actionsDiv.appendChild(editSpan);
            actionsDiv.appendChild(starSpan);
            listItem.appendChild(detailsDiv);
            listItem.appendChild(actionsDiv);
            listElement.appendChild(listItem);
        }
    };

    // --- Modal Logic ---

    const validateUrl = () => {
        const urlValue = urlInput.value;
        let isValid = false;

        if (urlValue.includes('%s')) {
            try {
                // Use the URL constructor to validate the overall structure
                const url = new URL(urlValue.replace('%s', 'test'));
                // Check if the protocol is http or https
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    isValid = true;
                }
            } catch (e) {
                // If the URL constructor throws an error, it's not a valid URL
                isValid = false;
            }
        }
        saveBtn.disabled = !isValid;
    };

    const openModal = (editing = false, engine = {}) => {
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
        engineForm.reset();
        modalElement.style.display = 'none';
    };

    const handleFormSubmit = async(event) => {
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
        if (customEngines[originalKey]) {
            delete customEngines[originalKey];
            await saveData();
            renderEngineList(getCombinedEngines());
            closeModal();
        }
    };

    const handleDelete = async() => {
        const confirmMessage = chrome.i18n.getMessage('confirmDeleteMessage', originalKey);
        if (confirm(confirmMessage)) {
            if (customEngines[originalKey]) {
                delete customEngines[originalKey];
            }
            if (favoriteEngines.has(originalKey)) {
                favoriteEngines.delete(originalKey);
            }
            await saveData();
            renderEngineList(getCombinedEngines());
            closeModal();
        }
    };

    // --- Main Initialization & Localization ---

    const localizePage = () => {
        document.querySelectorAll('[data-i18n]').forEach(elem => {
            const messageKey = elem.getAttribute('data-i18n');
            elem.textContent = chrome.i18n.getMessage(messageKey);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
            const messageKey = elem.getAttribute('data-i18n-placeholder');
            elem.placeholder = chrome.i18n.getMessage(messageKey);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(elem => {
            const messageKey = elem.getAttribute('data-i18n-title');
            elem.title = chrome.i18n.getMessage(messageKey);
        });

        const descriptionElement = document.getElementById('popupDescription');
        descriptionElement.innerHTML = chrome.i18n.getMessage("popupDescription");
    };

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
});
