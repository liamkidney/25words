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
    assert.match(html, /href="\.\/favicon-32\.png\?v=1abcde99"/);
    assert.match(html, /href="\.\/icon\.svg\?v=1abcde99"/);
    assert.match(html, /href="\.\/apple-touch-icon\.png\?v=1abcde99"/);
    assert.match(html, /href="\.\/manifest\.json\?v=1abcde99"/);
    assert.match(html, /src="\.\/cache\.js\?v=1abcde99" data-cache-manager/);
    assert.match(html, /dev · 1abcde99/);
    assert.match(worker, /const CHANNEL = 'dev'/);
    assert.match(worker, /const REVISION = '1abcde99'/);
    assert.match(worker, /cache: 'no-store'/);
    assert.match(worker, /CHANNEL === 'prod'/);
    assert.match(client, /updateViaCache: 'none'/);
    assert.match(client, /controllerchange/);
    assert.ok(existsSync(join(output, 'app.js')));
    const iconSvg = readFileSync(join(output, 'icon.svg'), 'utf8');
    assert.match(iconSvg, /<linearGradient id="bg"/);
    assert.match(iconSvg, /stop-color="#849fe3"/);
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.id, '/25words/dev/');
    assert.equal(manifest.name, '25 Words Dev');
    assert.equal(manifest.short_name, '25 Words Dev');
    assert.match(html, /name="apple-mobile-web-app-title" content="25 Words Dev"/);
    assert.equal(manifest.icons.length, 3);
    assert.match(manifest.icons[0].src, /\?v=1abcde99$/);
    for (const [file, size] of [
      ['favicon-32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512]
    ]) {
      const png = readFileSync(join(output, file));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file + ' PNG signature');
      assert.equal(png.readUInt32BE(16), size, file + ' width');
      assert.equal(png.readUInt32BE(20), size, file + ' height');
      assert.match(worker, new RegExp(file.replace('.', '\\.') + '\\\?v='));
    }
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
