import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Stamp each published environment with its own Git commit and use a
// network-first, channel-specific service worker (as in Blocks).
const output = process.env.SITE_OUT || 'dist';
const revision = process.env.SITE_REVISION || 'local';
if (!/^(?:[a-f\d]{7,40}|local)$/.test(revision)) {
  throw new Error('SITE_REVISION must be a short Git SHA or local');
}
const sourceHtml = await readFile('index.html', 'utf8');
const hasAppJs = sourceHtml.includes('src="./app.js"');
const channel = process.env.SITE_CHANNEL || (hasAppJs ? 'dev' : 'prod');
if (channel !== 'prod' && channel !== 'dev') throw new Error('Invalid SITE_CHANNEL');
if (!sourceHtml.includes('</head>') || !sourceHtml.includes('</main>')) {
  throw new Error('Unexpected index.html structure');
}

let html = sourceHtml;
if (hasAppJs) {
  html = html.replace('src="./app.js"', 'src="./app.js?v=' + revision + '"');
}
if (channel === 'dev') {
  html = html.replace('href="./favicon.svg"', 'href="./favicon.svg?v=' + revision + '"');
}
html = html.replace('</head>',
  '  <script src="./cache.js?v=' + revision + '" data-cache-manager defer></script>\n</head>');
html = html.replace('</main>',
  '  <div id="build-version" style="margin-top:14px;text-align:right;font-size:11px;color:#8b949a">' +
  channel + ' · ' + revision + '</div>\n  </main>');

const template = await readFile('sw.js', 'utf8');
if (!template.includes('__CHANNEL__') || !template.includes('__REVISION__')) {
  throw new Error('Missing service worker placeholders');
}
const worker = template.replaceAll('__CHANNEL__', channel).replaceAll('__REVISION__', revision);
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(join(output, 'index.html'), html),
  copyFile('cache.js', join(output, 'cache.js')),
  ...(channel === 'dev' ? [copyFile('favicon.svg', join(output, 'favicon.svg'))] : []),
  writeFile(join(output, 'sw.js'), worker),
  ...(hasAppJs ? [copyFile('app.js', join(output, 'app.js'))] : [])
]);
