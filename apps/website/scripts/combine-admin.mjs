#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteDist = join(__dirname, '..', 'dist');
const adminDist = join(__dirname, '..', '..', 'admin-web', 'dist');

if (!existsSync(adminDist)) {
  console.error('Admin build not found. Run: cd apps/admin-web && npm run build');
  process.exit(1);
}

const adminOutput = join(websiteDist, 'admin');
mkdirSync(adminOutput, { recursive: true });
cpSync(join(adminDist, 'index.html'), join(adminOutput, 'index.html'));
if (existsSync(join(adminDist, 'assets'))) {
  cpSync(join(adminDist, 'assets'), join(adminOutput, 'assets'), { recursive: true });
}
console.log('Admin dashboard copied to dist/admin/');
