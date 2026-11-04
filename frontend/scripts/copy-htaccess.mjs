// Copies the shared-hosting rules into the FTP build output.
//
// `vite build --emptyOutDir` wipes `dist-ftp`, so `.htaccess` is kept in
// `frontend/ftp/` and re-added here on every build.
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'ftp', '.htaccess');
const target = join(here, '..', 'dist-ftp', '.htaccess');

copyFileSync(source, target);
console.log('FTP build: copied .htaccess -> dist-ftp/.htaccess');
