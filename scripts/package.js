// scripts/package.js
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

// --- Configuration ---
// Determine target browser from environment variable, default to 'chrome'
const target = process.env.TARGET || 'chrome';
// Set file extension based on the target browser
const fileExtension = target === 'firefox' ? 'xpi' : 'zip';

// --- Path Definitions ---
// Helper to get the project root directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

// Define source and output directories and the final file name
const sourceDir = path.resolve(projectRoot, 'dist', target);
const outputDir = path.resolve(projectRoot, 'dist_zip');
const outputFilename = `omniscan-${target}-v${version}.${fileExtension}`;
const outputFile = path.join(outputDir, outputFilename);

// --- Main Script ---
console.log(`Packaging for ${target}...`);
console.log(`Source: ${sourceDir}`);
console.log(`Output: ${outputFile}`);

// Ensure the output directory exists
fs.mkdirSync(outputDir, {
    recursive: true
});

// Create a file stream to write the archive to
const output = fs.createWriteStream(outputFile);
const archive = archiver('zip', {
    zlib: {
        level: 9
    } // Set the compression level
});

// --- Event Handlers ---
// Listen for the 'close' event, which indicates the archive has been finalized
output.on('close', () => {
    console.log(`✅ Successfully created package: ${outputFilename} (${archive.pointer()} total bytes)`);
});

// Listen for warnings
archive.on('warning', (err) => {
    if (err.code !== 'ENOENT') {
        throw err;
    }
});

// Listen for errors
archive.on('error', (err) => {
    throw err;
});

// --- Execution ---
// Pipe the archive data to the output file
archive.pipe(output);

// Add all files from the source directory to the root of the archive
archive.directory(sourceDir, false);

// Finalize the archive and trigger the 'close' event
archive.finalize();
