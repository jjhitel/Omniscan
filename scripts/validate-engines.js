// scripts/validate-engines.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Calculate the absolute path to the engines.json file in its new location.
const enginesFilePath = path.join(__dirname, '..', 'public', 'assets', 'engines.json');

console.log(`Validating engines file: ${enginesFilePath}`);

let hasError = false;

try {
    // 1. Read file and parse JSON
    const fileContent = fs.readFileSync(enginesFilePath, 'utf8');
    const engines = JSON.parse(fileContent);

    if (!Array.isArray(engines)) {
        throw new Error('engines.json is not a JSON array.');
    }

    const uniqueKeys = new Set();

    // 2. Iterate through and validate each engine entry
    for (const engine of engines) {
        const { key, name, url } = engine;

        // 2-1. Check for the existence of required fields (key, name, url)
        if (!key || !name || !url) {
            console.error(`❌ [Invalid Entry] An engine is missing required fields (key, name, or url). Entry:`, engine);
            hasError = true;
            continue; // Move to the next engine
        }

        // 2-2. Check for duplicate keys
        if (uniqueKeys.has(key)) {
            console.error(`❌ [Duplicate Key] The key '${key}' is duplicated.`);
            hasError = true;
        }
        uniqueKeys.add(key);

        // 2-3. Check if the URL includes the '%s' placeholder
        if (!url.includes('%s')) {
            console.error(`❌ [Invalid URL] URL for '${name}' (${key}) must include a '%s' placeholder. URL: ${url}`);
            hasError = true;
        }

        // 2-4. Validate URL syntax using the new URL API
        try {
            // Replace '%s' with a test value to check if it's a valid URL
            new URL(url.replace('%s', 'test'));
        } catch (urlError) {
            console.error(`❌ [Malformed URL] URL for '${name}' (${key}) is not a valid URL. URL: ${url}`);
            hasError = true;
        }
    }

} catch (error) {
    console.error(`❌ An error occurred while reading or parsing engines.json:`, error);
    hasError = true;
}

// 3. Exit the process based on the final result
if (hasError) {
    console.log('\nEngine validation failed.');
    process.exit(1); // Return exit code 1 to indicate failure in CI
} else {
    console.log('\n✅ All engines are valid!');
    process.exit(0); // Return exit code 0 to indicate success in CI
}
