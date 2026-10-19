import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

test('build stamps unique asset URLs and a channel-specific, network-first cache', () => {
  const output = mkdtempSync(join(tmpdir(), '25words-build-'));
  try {
    execFileSync(process.execPath, ['build.mjs'], {
      cwd: root,
      env: { ...process.env, SITE_OUT: output, SITE_REVISION: '1abcde99', SITE_CHANNEL: 'dev' }
    });
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    const worker = readFileSync(join(output, 'sw.js'), 'utf8');
    const client = readFileSync(join(output, 'cache.js'), 'utf8');

    assert.match(html, /src="\.\/app\.js\?v=1abcde99"/);
    assert.match(html, /href="\.\/favicon\.svg\?v=1abcde99"/);
    assert.match(html, /src="\.\/cache\.js\?v=1abcde99" data-cache-manager/);
    assert.match(html, /dev · 1abcde99/);
    assert.match(worker, /const CHANNEL = 'dev'/);
    assert.match(worker, /const REVISION = '1abcde99'/);
    assert.match(worker, /cache: 'no-store'/);
    assert.match(worker, /CHANNEL === 'prod'/);
    assert.match(client, /updateViaCache: 'none'/);
    assert.match(client, /controllerchange/);
    assert.ok(existsSync(join(output, 'app.js')));
    assert.ok(existsSync(join(output, 'favicon.svg')));
    assert.match(readFileSync(join(output, 'favicon.svg'), 'utf8'), /<linearGradient id="bg"/);
    assert.match(worker, /favicon\.svg\?v=' \+ REVISION/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
