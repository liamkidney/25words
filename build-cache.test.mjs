import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('.', import.meta.url));

test('build stamps unique asset URLs and a channel-specific, network-first cache', () => {
  const output = mkdtempSync(join(tmpdir(), '25words-build-'));
  try {
    execFileSync(process.execPath, ['build.mjs'], {
      cwd: root,
      env: { ...process.env, SITE_OUT: output, SITE_REVISION: '1abcde99', SITE_CHANNEL: 'prod' }
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
    assert.match(html, /prod · 1abcde99/);
    assert.match(worker, /const CHANNEL = 'prod'/);
    assert.match(worker, /const REVISION = '1abcde99'/);
    assert.match(worker, /cache: 'no-store'/);
    assert.match(worker, /CHANNEL === 'prod'/);
    assert.match(client, /updateViaCache: 'none'/);
    assert.match(client, /controllerchange/);
    assert.match(client, /'_version_check'/);
    assert.match(client, /window\.location\.replace\(destination\.href\)/);
    assert.ok(client.includes("register('./sw.js', {"));
    assert.ok(!client.includes("register('./sw.js?v='"));
    assert.ok(client.includes("new URL('./version.json', registration.scope)"));
    assert.ok(worker.includes("url.pathname === new URL('./version.json', self.registration.scope).pathname"));
    assert.ok(worker.includes("request.mode === 'navigate'"));
    assert.ok(worker.includes("cache.put(cacheKey, copy)"));
    assert.ok(existsSync(join(output, 'app.js')));
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'version.json'), 'utf8')),
      {channel: 'prod', revision: '1abcde99'});
    assert.match(worker, /'\.\/app\.js\?v=' \+ REVISION/);
    const iconSvg = readFileSync(join(output, 'icon.svg'), 'utf8');
    assert.match(iconSvg, /<linearGradient id="bg"/);
    assert.match(iconSvg, /stop-color="#849fe3"/);
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.id, '/25words/');
    assert.equal(manifest.name, '25 Words');
    assert.equal(manifest.short_name, '25 Words');
    assert.equal(manifest.background_color, '#ffffff');
    assert.equal(Object.hasOwn(manifest, 'theme_color'), false,
      'An install-time theme colour must not freeze the changing status-bar colour');
    assert.doesNotMatch(html, /apple-mobile-web-app-status-bar-style|<meta name="theme-color"/);
    assert.match(html, /name="apple-mobile-web-app-title" content="25 Words"/);
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


test('a single source build produces complete dev PWA assets and branding', () => {
  const output = mkdtempSync(join(tmpdir(), '25words-dev-build-'));
  try {
    execFileSync(process.execPath, ['build.mjs'], {
      cwd: root,
      env: { ...process.env, SITE_OUT: output, SITE_REVISION: '1234abcd', SITE_CHANNEL: 'dev' }
    });
    const html = readFileSync(join(output, 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8'));
    assert.match(html, /name="apple-mobile-web-app-title" content="25 Words Dev"/);
    assert.match(html, /src="\.\/app\.js\?v=1234abcd"/);
    assert.equal(manifest.name, '25 Words Dev');
    assert.equal(manifest.id, '/25words/dev/');
    assert.deepEqual(JSON.parse(readFileSync(join(output, 'version.json'), 'utf8')),
      {channel: 'dev', revision: '1234abcd'});
    for (const icon of ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
      assert.ok(existsSync(join(output, icon)), icon);
    }
    assert.match(readFileSync(join(output, 'sw.js'), 'utf8'), /const CHANNEL = 'dev'/);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('resumed iOS app compares an uncached version file and navigates to a newer build', async () => {
  const script = readFileSync(join(root, 'cache.js'), 'utf8');
  const windowEvents = new Map();
  const documentEvents = new Map();
  const swEvents = new Map();
  const current = '1234abcd', published = 'deadbeef';
  const fetched = [];
  let navigated = '';
  let registered = '';
  let updateCalls = 0;
  const document = {
    visibilityState: 'visible',
    querySelector: () => ({src: 'https://example.com/25words/dev/cache.js?v=' + current}),
    addEventListener: (key,fn) => documentEvents.set(key,fn)
  };
  const registration = {
    scope: 'https://example.com/25words/dev/',
    update: async () => { updateCalls++; }
  };
  const navigator = {serviceWorker: {
    controller: {},
    addEventListener: (key,fn) => swEvents.set(key,fn),
    register: async (url, options) => {
      registered = url;
      assert.equal(options.updateViaCache, 'none');
      return registration;
    }
  }};
  const window = {
    location: {
      href: 'https://example.com/25words/dev/',
      replace: url => { navigated=url; }
    },
    addEventListener: (key,fn) => windowEvents.set(key,fn),
    setInterval: (fn,delay) => { assert.equal(delay, 60000); }
  };
  const fetch = async (url, options) => {
    fetched.push({url,options});
    return {ok: true, json: async () => ({channel: 'dev', revision: published})};
  };
  runInNewContext(script, {window, document, navigator, fetch, URL});
  await windowEvents.get('load')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(registered, './sw.js', 'the same worker URL is used by every build');
  assert.equal(updateCalls, 1);
  assert.equal(fetched.length, 1);
  assert.equal(new URL(fetched[0].url).pathname, '/25words/dev/version.json');
  assert.ok(new URL(fetched[0].url).searchParams.has('_version_check'));
  assert.equal(fetched[0].options.cache, 'no-store');
  assert.equal(new URL(navigated).searchParams.get('_app_rev'), published);
  assert.equal(new URL(navigated).pathname, '/25words/dev/');
  swEvents.get('controllerchange')();
  assert.equal(new URL(navigated).searchParams.get('_app_rev'), published,
    'controllerchange does not start a competing navigation');
});

test('unchanged, wrong-channel and offline version checks do not reload or lose progress', async () => {
  const script = readFileSync(join(root, 'cache.js'), 'utf8');
  for (const scenario of ['unchanged', 'other-channel', 'offline']) {
    const windowEvents = {};
    let navigated=0, updated=0;
    const registration = {
      scope: 'https://example.com/25words/dev/',
      update: async()=>{updated++;}
    };
    const window = {
      location: {href:registration.scope,replace:()=>navigated++},
      addEventListener:(type,fn)=>{windowEvents[type]=fn;},
      setInterval:()=>{}
    };
    const document = {
      visibilityState:'visible',
      querySelector:()=>({src:registration.scope+'cache.js?v=1234abcd'}),
      addEventListener:()=>{}
    };
    const navigator={serviceWorker:{
      controller:{},register:async()=>registration,addEventListener:()=>{}
    }};
    const fetch=async()=>{
      if(scenario==='offline')throw Error('No connection');
      return {ok:true,json:async()=>scenario==='other-channel'
        ? {channel:'prod',revision:'deadbeef'}
        : {channel:'dev',revision:'1234abcd'}};
    };
    runInNewContext(script,{window,document,navigator,fetch,URL});
    await windowEvents.load();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(updated,1);
    assert.equal(navigated,0,scenario);
  }
});

test('an updated worker refreshes an already-open page using a new navigation URL', async () => {
  const script=readFileSync(join(root,'cache.js'),'utf8');
  const events={};
  let nextUrl='';
  const scope='https://example.com/25words/dev/';
  const window={
    location:{href:scope,replace:(u)=>{nextUrl=u;}},
    addEventListener:(type,fn)=>events['window:'+type]=fn,
    setInterval:()=>{}
  };
  const document={
    visibilityState:'visible',
    querySelector:()=>({src:scope+'cache.js?v=1234abcd'}),
    addEventListener:(type,fn)=>events['document:'+type]=fn
  };
  const navigator={serviceWorker:{
    controller:{},
    addEventListener:(type,fn)=>events['worker:'+type]=fn,
    register:async()=>({scope,update:async()=>{}})
  }};
  const fetch=async()=>({ok:true,json:async()=>({channel:'dev',revision:'1234abcd'})});
  runInNewContext(script,{window,document,navigator,fetch,URL});
  await events['window:load']();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nextUrl,'');
  events['worker:controllerchange']();
  assert.ok(new URL(nextUrl).searchParams.has('_sw_refresh'));
  assert.equal(new URL(nextUrl).pathname,'/25words/dev/');
});

test('a revision already attempted does not cause a redirect loop', async () => {
  const script=readFileSync(join(root,'cache.js'),'utf8');
  const events={};
  let navigations=0;
  const scope='https://example.com/25words/dev/';
  const window={
    location:{href:scope+'?_app_rev=deadbeef',replace:()=>{navigations++;}},
    addEventListener:(type,fn)=>events[type]=fn,
    setInterval:()=>{}
  };
  const document={
    visibilityState:'visible',
    querySelector:()=>({src:scope+'cache.js?v=1234abcd'}),
    addEventListener:()=>{}
  };
  const navigator={serviceWorker:{
    controller:{},addEventListener:()=>{},
    register:async()=>({scope,update:async()=>{}})
  }};
  const fetch=async()=>({ok:true,json:async()=>({channel:'dev',revision:'deadbeef'})});
  runInNewContext(script,{window,document,navigator,fetch,URL});
  await events.load();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(navigations,0);
});
