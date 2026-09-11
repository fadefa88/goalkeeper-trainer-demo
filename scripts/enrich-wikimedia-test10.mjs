#!/usr/bin/env node
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(x => x.startsWith('--'))
    .map(x => {
      const [k, ...v] = x.slice(2).split('=');
      return [k, v.length ? v.join('=') : true];
    })
);

const season = args.season || '2026';
const input = resolve(ROOT, args.input || `scripts/import-serie-abc-${season}.json`);
const logoDir = resolve(ROOT, args['logo-dir'] || 'assets/club-logos');
const tempInput = resolve(ROOT, `scripts/.wikimedia-test10-${season}.json`);
const resolver = resolve(ROOT, 'scripts/enrich-wikimedia-logos-v2.mjs');

const allClubs = JSON.parse(await readFile(input, 'utf8'));
const testClubs = allClubs.slice(0, 10);

console.log(`TEST LIMITATO: elaboro solo ${testClubs.length}/${allClubs.length} società.`);
console.log(`Società test: ${testClubs.map(c => c.shortName || c.officialName || c.id).join(', ')}`);

await writeFile(tempInput, JSON.stringify(testClubs, null, 2) + '\n');

const childArgs = [
  resolver,
  `--season=${season}`,
  `--input=${tempInput}`,
  `--logo-dir=${logoDir}`
];

const exitCode = await new Promise((resolveCode, reject) => {
  const child = spawn(process.execPath, childArgs, {
    cwd: ROOT,
    stdio: 'inherit'
  });
  child.on('error', reject);
  child.on('exit', code => resolveCode(code ?? 1));
});

if (exitCode !== 0) {
  await rm(tempInput, { force: true }).catch(() => {});
  process.exit(exitCode);
}

const enriched = JSON.parse(await readFile(tempInput, 'utf8'));
const enrichedById = new Map(enriched.map(c => [c.id, c]));
const merged = allClubs.map(c => enrichedById.get(c.id) || c);

await writeFile(input, JSON.stringify(merged, null, 2) + '\n');
await rm(tempInput, { force: true });

console.log(`\nTest completato: risultati delle prime ${testClubs.length} società riportati nel catalogo completo.`);
