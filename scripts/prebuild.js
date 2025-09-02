// scripts/prebuild.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

console.log('Synchronizing versions...');

// --- Define Paths ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const manifestPath = path.join(__dirname, '..', 'src', 'manifest.json');

// --- Read package.json to get the version ---
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

if (!version) {
    console.error("❌ Version not found in package.json. Please add a 'version' field.");
    process.exit(1);
}

// --- Read manifest.json, update its version, and write it back ---
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Update the version only if it's different to avoid unnecessary file writes
if (manifestJson.version !== version) {
    console.log(`Updating manifest.json version from ${manifestJson.version} to ${version}...`);
    manifestJson.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifestJson, null, 4), 'utf8');
} else {
    console.log('Versions are already in sync.');
}

console.log('✅ Version synchronization complete.');
