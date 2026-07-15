#!/usr/bin/env node
// Stop-hook quality gate: blocks finishing a turn if TypeScript does not typecheck.
// Efficient: skips instantly when no backend/client TS source changed since the last
// successful check (tracked via a marker file).

import { execSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..'); // .claude/hooks -> project root
const marker = join(here, '.last-typecheck');

const SOURCE_DIRS = [
  join(projectRoot, 'backend', 'src'),
  join(projectRoot, 'client', 'src'),
];

function latestSourceMtime() {
  let latest = 0;
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { recursive: true })) {
      const name = String(entry);
      if (!/\.(ts|tsx)$/.test(name)) continue;
      try {
        const m = statSync(join(dir, name)).mtimeMs;
        if (m > latest) latest = m;
      } catch {
        // ignore files that vanished mid-scan
      }
    }
  }
  return latest;
}

function readMarker() {
  try {
    return Number(readFileSync(marker, 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

function block(reason) {
  // Stop-hook JSON: block finishing and feed the reason back to the model.
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

try {
  const latest = latestSourceMtime();
  if (latest === 0) process.exit(0); // no source found — nothing to gate

  if (latest <= readMarker()) process.exit(0); // unchanged since last green check

  try {
    execSync('npm run typecheck', {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim();
    block(
      'TypeScript typecheck failed — fix these errors before finishing:\n\n' +
        out.slice(0, 4000),
    );
  }

  // Passed — record the mtime so unchanged turns skip the check.
  writeFileSync(marker, String(latest), 'utf8');
  process.exit(0);
} catch (err) {
  // Never hard-fail the session because the gate itself errored.
  process.stdout.write(
    JSON.stringify({ systemMessage: `typecheck-gate hook error: ${err?.message ?? err}` }),
  );
  process.exit(0);
}