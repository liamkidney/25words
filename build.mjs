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
// PWA branding is a build-time environment setting, not branch-specific HTML.
html = html.replace('name="apple-mobile-web-app-title" content="25 Words"',
  'name="apple-mobile-web-app-title" content="' + (channel === 'dev' ? '25 Words Dev' : '25 Words') + '"');
if (hasAppJs) {
  html = html.replace('src="./app.js"', 'src="./app.js?v=' + revision + '"');
}
{
  // As in Blocks, revision-stamp every icon/manifest reference so a new
  // deployment cannot accidentally reuse old Safari or browser icon URLs.
  html = html.replace(/\?v=[\w-]+/g, '?v=' + revision);
}
html = html.replace('</head>',
  '  <script src="./cache.js?v=' + revision + '" data-cache-manager defer></script>\n</head>');
// Show the build revision beneath, not inside, the floating word-list card.
html = html.replace('</main>',
  '</main>\n  <div id="build-version" style="margin:0 22px 10px;text-align:right;font-size:11px;color:#8b949a">' +
  channel + ' · ' + revision + '</div>');

const template = await readFile('sw.js', 'utf8');
if (!template.includes('__CHANNEL__') || !template.includes('__REVISION__')) {
  throw new Error('Missing service worker placeholders');
}
const worker = template.replaceAll('__CHANNEL__', channel).replaceAll('__REVISION__', revision);
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(join(output, 'index.html'), html),
  writeFile(join(output, 'version.json'), JSON.stringify({channel, revision}) + '\n'),
  copyFile('cache.js', join(output, 'cache.js')),

  writeFile(join(output, 'sw.js'), worker),
  ...(hasAppJs ? [copyFile('app.js', join(output, 'app.js'))] : [])
]);

{
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
    name: channel === 'dev' ? '25 Words Dev' : '25 Words',
    short_name: channel === 'dev' ? '25 Words Dev' : '25 Words',
    id: channel === 'dev' ? '/25words/dev/' : '/25words/',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
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
