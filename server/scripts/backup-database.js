#!/usr/bin/env node
require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');
if (process.env.NODE_ENV === 'production' && process.env.BACKUP_CONFIRM !== 'YES') {
  throw new Error('Production backup requires BACKUP_CONFIRM=YES');
}

const dir = path.resolve(process.env.BACKUP_DIR || './backups');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = path.join(dir, `shekhar-bandhu-${stamp}.archive.gz`);

const child = spawn('mongodump', ['--uri', uri, '--archive=' + archive, '--gzip'], { stdio: 'inherit' });
child.on('error', err => { console.error('mongodump could not be started:', err.message); process.exit(1); });
child.on('exit', code => {
  if (code !== 0) process.exit(code || 1);
  fs.chmodSync(archive, 0o600);
  console.log(`Backup created: ${archive}`);
  console.log('Store a copy outside the application host and verify restoration regularly.');
});
