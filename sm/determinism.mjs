// Builds twice from the same sources and requires byte-identical output (same SM-FILES.json digest).
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, SM_LOCAL_COMMIT: process.env.SM_LOCAL_COMMIT || 'determinism-check' };
const digests = [];
for (let run = 0; run < 2; run++) {
    execFileSync(process.execPath, [path.join(root, 'sm/build.mjs')], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] });
    digests.push(createHash('sha256').update(await readFile(path.join(root, 'build/sm-ad-filter/SM-FILES.json'))).digest('hex'));
}
if (digests[0] !== digests[1]) { console.error('NOT DETERMINISTIC', digests); process.exit(1); }
console.log(JSON.stringify({ status: 'PASS', runs: 2, filesManifestSha256: digests[0] }));
