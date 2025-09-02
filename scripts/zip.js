// scripts/zip.js
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

// Get version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Define paths
const SOURCE_DIR = path.join(__dirname, '..', 'dist');
const OUTPUT_DIR = path.join(__dirname, '..', 'dist_zip');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `omniscan-v${version}.zip`);

console.log(`Zipping directory: ${SOURCE_DIR}`);
console.log(`Output file: ${OUTPUT_FILE}`);

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// Create a file to stream archive data to.
const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', {
    zlib: {
        level: 9
    } // Sets the compression level.
});

// Listen for all archive data to be written
output.on('close', function () {
    console.log(`✅ Successfully created zip archive with ${archive.pointer()} total bytes.`);
});

archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
        console.warn('Warning:', err);
    } else {
        throw err;
    }
});

archive.on('error', function (err) {
    throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Append files from the 'dist' directory
archive.directory(SOURCE_DIR, false);

// Finalize the archive (this triggers the 'close' event)
archive.finalize();
