#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const passArgs = process.argv.slice(2);

console.log('Fase 1: Serie A/B + tentativo Sofascore Serie C...');
const base = spawnSync(node, [resolve(ROOT, 'scripts/enrich-multisource-logos-v2.mjs'), ...passArgs], {
  stdio: 'inherit'
});
if (base.status && base.status !== 0) {
  console.warn(`Resolver base terminato con codice ${base.status}; continuo con repair ufficiale Serie C.`);
}

console.log('\nFase 2: repair Serie C da seriec.com/clubs...');
const repair = spawnSync(node, [resolve(ROOT, 'scripts/repair-seriec-official.mjs'), ...passArgs], {
  stdio: 'inherit'
});

process.exit(repair.status ?? 1);
