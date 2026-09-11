#!/usr/bin/env node
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');

const uri = process.env.MONGODB_URI;
const archive = process.argv[2];
if (!uri) throw new Error('MONGODB_URI is required');
if (!archive) throw new Error('Usage: node scripts/restore-database.js /path/to/archive.gz');
if (!fs.existsSync(archive)) throw new Error(`Backup archive not found: ${archive}`);
if (process.env.NODE_ENV === 'production' && process.env.RESTORE_CONFIRM !== 'YES') {
  throw new Error('Production restore requires RESTORE_CONFIRM=YES');
}
if (process.env.RESTORE_CONFIRM !== 'YES') {
  throw new Error('Restore requires RESTORE_CONFIRM=YES');
}

console.error('WARNING: This operation replaces data in the target MongoDB.');
const child = spawn('mongorestore', ['--uri', uri, '--archive=' + archive, '--gzip', '--drop'], { stdio: 'inherit' });
child.on('error', err => { console.error('mongorestore could not be started:', err.message); process.exit(1); });
child.on('exit', code => process.exit(code || 0));
