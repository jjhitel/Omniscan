// scripts/build.js

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const ZIP_PATH = path.join(DIST_DIR, 'omniscan.zip');

console.log('Starting the build process...');

// 1. Ensure the output directory is clean and exists.
if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, {
        recursive: true,
        force: true
    });
}
fs.mkdirSync(DIST_DIR);

// 2. Create a file to stream archive data to.
const output = fs.createWriteStream(ZIP_PATH);
const archive = archiver('zip', {
    zlib: {
        level: 9
    } // Set the compression level.
});

// Listen for all archive data to be written
output.on('close', function () {
    console.log(`✅ Build successful! ${archive.pointer()} total bytes.`);
    console.log(`Package created at: ${ZIP_PATH}`);
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

// 3. Add all necessary files to the archive.
console.log('Adding files to the archive...');

// Add individual files from the root directory
const rootFiles = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'popup.css', 'engines.json'];
rootFiles.forEach(file => {
    archive.file(path.join(__dirname, '..', file), {
        name: file
    });
});

// Add entire directories
archive.directory(path.join(__dirname, '..', 'images/'), 'images');
archive.directory(path.join(__dirname, '..', '_locales/'), '_locales');

// 4. Finalize the archive (this triggers the 'close' event)
archive.finalize();
