// scripts/prebuild.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('Synchronizing manifest versions...');

// --- Define Paths ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const srcPath = path.join(__dirname, '..', 'src');
const manifestPaths = [
    path.join(srcPath, 'manifest.chrome.json'),
    path.join(srcPath, 'manifest.firefox.json')
];

// --- Read package.json to get the version ---
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

if (!version) {
    console.error("❌ Version not found in package.json. Please add a 'version' field.");
    process.exit(1);
}

// --- Update version in all manifest files ---
manifestPaths.forEach(manifestPath => {
    if (fs.existsSync(manifestPath)) {
        const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        if (manifestJson.version !== version) {
            console.log(`Updating ${path.basename(manifestPath)} version from ${manifestJson.version} to ${version}...`);
            manifestJson.version = version;
            fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 4), 'utf8');
        } else {
            console.log(`${path.basename(manifestPath)} version is already in sync.`);
        }
    } else {
        console.warn(`⚠️ Manifest file not found at: ${manifestPath}`);
    }
});

console.log('✅ Version synchronization complete.');
