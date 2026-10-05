import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'manifest.json');
const packagePath = path.join(root, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const packageMetadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const forbiddenPath = /(^|[\\/])(?:\.agents|\.claude|\.codex|node_modules|plans)(?:[\\/]|$)/;
const forbiddenContent = /(?:AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----|\/Users\/|\/home\/|[A-Z]:\\Users\\)/;
const failures = [];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (['.git', '.agents', '.claude', '.codex', 'node_modules', 'plans', 'coverage', 'dist'].includes(entry.name)) return [];
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`missing required file: ${relativePath}`);
}

requireFile('manifest.json');
requireFile('src/popup/popup.html');

if (manifest.manifest_version !== 3) failures.push('manifest must use Manifest V3');
if (!manifest.name || !manifest.version || !manifest.description) failures.push('manifest name, version, and description are required');
if (packageMetadata.version !== manifest.version) failures.push('package.json and manifest.json versions must match');
if (manifest.host_permissions?.some((permission) => permission !== 'https://photos.google.com/*')) {
  failures.push('host permissions must remain limited to https://photos.google.com/*');
}

for (const relativePath of walk(root).map((file) => path.relative(root, file))) {
  if (forbiddenPath.test(relativePath)) failures.push(`forbidden path included: ${relativePath}`);
  if (forbiddenContent.test(fs.readFileSync(path.join(root, relativePath), 'utf8'))) {
    failures.push(`secret or machine-local content detected: ${relativePath}`);
  }
}

for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) requireFile(file);
}
if (manifest.action?.default_popup) requireFile(manifest.action.default_popup);
for (const icon of Object.values(manifest.icons ?? {})) requireFile(icon);

if (failures.length > 0) {
  console.error('Release validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Release validation passed for ${manifest.name} v${manifest.version}.`);
}
