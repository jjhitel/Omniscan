// popup.js

document.addEventListener('DOMContentLoaded', async() => {
    // --- DOM Elements ---
    const searchInputElement = document.getElementById('searchInput');
    const listElement = document.getElementById('engine-list');
    let allEngines = [];

    // --- Function to render the list of engines ---
    const renderEngineList = (enginesToRender) => {
        listElement.innerHTML = '';
        for (const engine of enginesToRender) {
            const listItem = document.createElement('li');
            const codeElement = document.createElement('code');
            codeElement.textContent = engine.key;
            const nameSpan = document.createElement('span');
            nameSpan.className = 'engine-name';
            nameSpan.textContent = engine.name;

            listItem.appendChild(codeElement);
            listItem.appendChild(nameSpan);
            listItem.dataset.url = engine.url;

            listItem.addEventListener('click', () => {
                const searchUrl = listItem.dataset.url;
                if (searchUrl) {
                    const homepage = new URL(searchUrl).origin;
                    chrome.tabs.create({
                        url: homepage,
                        active: true
                    });
                }
            });
            listElement.appendChild(listItem);
        }
    };

    // --- Main Initialization Logic ---

    // 1. Localize UI text
    document.getElementById('popupTitle').innerText = "Omniscan";

    // Safely construct the description to avoid innerHTML
    const descriptionMsg = chrome.i18n.getMessage("popupDescription");
    const descriptionParts = descriptionMsg.split(/<code>|<\/code>/);
    const descriptionElement = document.getElementById('popupDescription');
    descriptionElement.textContent = descriptionParts[0]; // "Type "
    const codeElement = document.createElement('code');
    codeElement.textContent = 'scan';
    descriptionElement.appendChild(codeElement);
    descriptionElement.append(descriptionParts[2]); // " in the address bar..."

    document.getElementById('popupExample').innerText = chrome.i18n.getMessage("popupExample");
    searchInputElement.placeholder = chrome.i18n.getMessage("searchInputPlaceholder");

    // 2. Fetch engine data from the JSON file
    try {
        const url = chrome.runtime.getURL('engines.json');
        const response = await fetch(url);
        allEngines = await response.json();
    } catch (error) {
        console.error("Omniscan: Failed to load engines.json", error);
        listElement.innerHTML = `<li>Error loading search engines.</li>`;
        return; // Stop execution if the file fails to load
    }

    // 3. Render the initial full list
    renderEngineList(allEngines);

    // 4. Set up event listener
    searchInputElement.addEventListener('keyup', (event) => {
        const searchTerm = event.target.value.toLowerCase().trim();
        const filteredEngines = allEngines.filter(engine =>
                engine.key.toLowerCase().includes(searchTerm) ||
                engine.name.toLowerCase().includes(searchTerm));
        renderEngineList(filteredEngines);
    });
});
