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
  // As in Blocks, revision-stamp every icon/manifest reference so a new
  // deployment cannot accidentally reuse old Safari or browser icon URLs.
  html = html.replace(/\?v=[\w-]+/g, '?v=' + revision);
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

  writeFile(join(output, 'sw.js'), worker),
  ...(hasAppJs ? [copyFile('app.js', join(output, 'app.js'))] : [])
]);

if (channel === 'dev') {
  // The SVG is the single source of truth; generate pixel icons rather than
  // relying on iOS Safari (or Add to Home Screen) to understand SVG favicons.
  const { Resvg } = await import('@resvg/resvg-js');
  const iconSvg = await readFile('icon.svg', 'utf8');
  const sizes = [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512]
  ];
  const icons = sizes.map(([name, size]) =>
    writeFile(join(output, name), new Resvg(iconSvg, { fitTo: { mode: 'width', value: size } }).render().asPng())
  );
  const manifest = {
    name: '25 Words Dev',
    short_name: '25 Words Dev',
    id: '/25words/dev/',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f7f7f5',
    theme_color: '#d8a0d8',
    icons: [
      { src: 'icon-192.png?v=' + revision, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png?v=' + revision, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon.svg?v=' + revision, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  };
  await Promise.all([
    copyFile('icon.svg', join(output, 'icon.svg')),
    writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n'),
    ...icons
  ]);
}
