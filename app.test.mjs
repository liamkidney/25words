import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

class FakeElement {
  constructor() {
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.focused = false;
    this.capturedPointer = null;
    this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  get firstElementChild() { return this.children[0]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(key, fn) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(fn);
  }
  dispatch(key, event = {}) {
    for (const fn of this.listeners.get(key) ?? []) {
      fn({ target: this, preventDefault() {}, ...event });
    }
  }
  focus() { this.focused = true; }
  scrollIntoView() {}
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
  contains(node) { return node === this || this.children.some(c => c.contains(node)); }
}

async function runApp({ savedIndex = null, count = 100, failing = false, savedProgress = null, secondPack = false } = {}) {
  const ids = ['header','pack-label','counter','words','reveal-cover','next','status','menu-toggle','list-menu','list-options','pack-options','viewed-indicator','viewed-count','round-backdrop-a','round-backdrop-b','tap-count','tap-number','tap-undo','tap-reset'];
  const elements = Object.fromEntries(ids.map(id => [id,new FakeElement()]));
  elements.header.replaceChildren(elements['menu-toggle'], elements['list-menu']);
  elements['list-menu'].replaceChildren(elements['pack-options'], elements['list-options']);
  elements['list-menu'].hidden = true;
  elements.words.hidden = true;
  elements['reveal-cover'].hidden = true;
  elements['menu-toggle'].disabled = true;
  elements.next.disabled = true;
  elements['tap-number'].textContent = '0';
  elements['tap-undo'].disabled = true;
  elements['tap-reset'].disabled = true;

  const document = new FakeElement();
  document.documentElement = new FakeElement();
  document.body = new FakeElement();
  document.createElement = () => new FakeElement();
  document.getElementById = id => elements[id];
  const store = new Map(savedIndex === null ? [] : [['25words-progress-v1', String(savedIndex)]]);
  if (savedProgress !== null) store.set('25words-progress-v2', JSON.stringify(savedProgress));
  const localStorage = {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  const lists = Array.from({length:count},(_,i)=>({
    id: 'list_'+(i+1),
    sequence:i+1,
    words: Array.from({length:10},(_,w)=>'word'+(i+1)+'_'+(w+1))
  }));
  const packs = [{ id:'pack-1', title:'Pack 1', sort_order:1 }];
  if (secondPack) packs.push({ id:'pack-2', title:'Pack 2', sort_order:2 });
  const fetch = async url => {
    if (failing) return {ok:false,status:503};
    if (url.includes('twentyfive_packs?')) return {ok:true,json:async()=>packs};
    if (url.includes('twentyfive_pack_entries?')) {
      const second = url.includes('pack-2');
      const items = second
        ? Array.from({length:2},(_,i)=>({id:'extra_'+(i+1),words:Array.from({length:10},(_,w)=>'extra_'+i+'_'+w)}))
        : lists;
      return {ok:true,json:async()=>items.map((list,i)=>({
        position:i+1, twentyfive_word_lists: {id:list.id, words:list.words}
      }))};
    }
    return {ok:false,status:404};
  };
  const window = new FakeElement();
  window.matchMedia = () => ({ matches: false });
  runInNewContext(script,{document,window,localStorage,fetch});
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,document,window,store};
}

test('compact app header and bottom sheet follow the agreed visual hierarchy', async () => {
  const headerIndex = html.indexOf('<header class="header" id="header">');
  const tapIndex = html.indexOf('<section class="tap-counter"');
  const sheetIndex = html.indexOf('<main class="panel">');
  assert.ok(headerIndex > 0 && tapIndex > headerIndex && sheetIndex > tapIndex);
  assert.match(html, /<h1>25 Words <span>or Less<\\/span><\\/h1>/);
  assert.match(html, /<div id="pack-label"><\\/div><div id="counter">Loading lists/);
  assert.match(html, /\\.app-layout \\{[^}]*min-height: calc\\(100dvh - env\\(safe-area-inset-top, 0px\\)\\);/s);
  assert.match(html, /\\.panel \\{[^}]*border-radius: 28px 28px 0 0;/s);
  assert.match(html, /padding: 26px 24px calc\\(22px \\+ env\\(safe-area-inset-bottom, 0px\\)\\)/);
  const {elements}=await runApp();
  assert.equal(elements['pack-label'].textContent, 'Pack 1');
  assert.equal(elements.counter.textContent, 'List 1 of 100');
  elements.next.dispatch('click');
  assert.equal(elements['pack-label'].textContent, 'Pack 1');
  assert.equal(elements.counter.textContent, 'List 2 of 100');
});

test('menu and reveal button are present and accessible',()=>{
  assert.match(html,/id="menu-toggle"[^>]+aria-controls="list-menu"/);
  assert.match(html,/id="list-menu"[^>]+hidden/);
  assert.match(html,/id="reveal-cover"[^>]+aria-controls="words"/);
  assert.match(html,/aria-label="Press and hold to reveal words"/);
  assert.match(html, /<button id="reveal-cover"[^>]*hidden><\\/button>/);
  assert.doesNotMatch(html, /class="cover-icon"|>Press and hold to reveal words</);
  assert.match(html,/class="round-backdrop" aria-hidden="true"/);
  assert.match(html,/prefers-reduced-motion: reduce/);
  assert.match(html,/\.panel \{\s*position: relative;\s*z-index: 1;/);
  assert.match(html,/data-revealing="true"/);
  assert.match(html,/<ol id="words" hidden>/);
  assert.match(html,/src=".\/app.js"/);
  assert.match(script,/twentyfive_pack_entries/);
});

test('menu selects any of 100 lists and saves navigation',async()=>{
  const {elements,store}=await runApp();
  assert.equal(elements['list-options'].children.length,100);
  assert.equal(elements['menu-toggle'].disabled,false);
  elements['menu-toggle'].dispatch('click');
  assert.equal(elements['list-menu'].hidden,false);
  elements['list-options'].children[26].dispatch('click');
  assert.equal(elements['pack-label'].textContent,'Pack 1');
  assert.equal(elements.counter.textContent,'List 27 of 100');
  assert.equal(elements['list-menu'].hidden,true);
  assert.equal(JSON.parse(store.get('25words-progress-v2')).positions['pack-1'],26);
  assert.equal(elements['list-options'].children[26].getAttribute('aria-current'),'true');
});

test('words reveal only while pointer is held, then hide on release',async()=>{
  const {elements}=await runApp();
  const cover=elements['reveal-cover'];
  assert.equal(elements.words.hidden,true);
  assert.equal(cover.hidden,false);
  cover.dispatch('pointerdown',{pointerId:7,pointerType:'touch',isPrimary:true});
  assert.equal(elements.words.hidden,false);
  assert.equal(cover.hidden,false);
  assert.equal(cover.capturedPointer,7);
  assert.equal(cover.getAttribute('data-revealing'),'true');
  assert.equal(cover.getAttribute('aria-pressed'),'true');
  assert.equal(elements.words.children.length,10);
  cover.dispatch('pointerup',{pointerId:7});
  assert.equal(elements.words.hidden,true);
  assert.equal(cover.getAttribute('data-revealing'),null);
  assert.equal(cover.getAttribute('aria-pressed'),'false');
  cover.dispatch('click'); // A release-generated click must not leave words exposed.
  assert.equal(elements.words.hidden,true);
});

test('press-and-hold prevents native selection and drag of game text',async()=>{
  assert.match(html,/\.panel, \.panel \* \{[^}]*-webkit-user-select: none;[^}]*user-select: none;[^}]*-webkit-touch-callout: none;/s);
  const {elements,document}=await runApp();
  const cover=elements['reveal-cover'];
  let prevented=0;
  cover.dispatch('pointerdown',{
    pointerId:4,pointerType:'touch',isPrimary:true,
    preventDefault:()=>prevented++
  });
  assert.equal(prevented,1);
  assert.equal(elements.words.hidden,false);
  cover.dispatch('pointerup',{pointerId:4});
  assert.equal(elements.words.hidden,true);

  for (const eventType of ['selectstart','dragstart']) {
    document.dispatch(eventType,{
      target:{closest:selector=>selector==='.panel'?elements.words:null},
      preventDefault:()=>prevented++
    });
  }
  assert.equal(prevented,3);
  document.dispatch('selectstart',{
    target:{closest:()=>null},
    preventDefault:()=>prevented++
  });
  assert.equal(prevented,3);
});

test('unrelated pointers, cancelled touch, and lost pointer capture are handled',async()=>{
  const {elements}=await runApp();
  const cover=elements['reveal-cover'];
  cover.dispatch('pointerdown',{pointerId:12,pointerType:'mouse',button:2});
  assert.equal(elements.words.hidden,true);
  cover.dispatch('pointerdown',{pointerId:12,pointerType:'touch',isPrimary:true});
  cover.dispatch('pointerup',{pointerId:24});
  assert.equal(elements.words.hidden,false);
  cover.dispatch('pointercancel',{pointerId:12});
  assert.equal(elements.words.hidden,true);
  cover.dispatch('pointerdown',{pointerId:13,pointerType:'touch',isPrimary:true});
  assert.equal(elements.words.hidden,false);
  cover.dispatch('lostpointercapture',{pointerId:13});
  assert.equal(elements.words.hidden,true);
});

test('Space or Enter reveals while held, then hides on keyup or blur',async()=>{
  const {elements,document,window}=await runApp();
  const cover=elements['reveal-cover'];
  let prevented=0;
  const preventDefault=()=>prevented++;
  cover.dispatch('keydown',{key:' ',preventDefault});
  assert.equal(elements.words.hidden,false);
  cover.dispatch('keyup',{key:' ',preventDefault});
  assert.equal(elements.words.hidden,true);
  cover.dispatch('keydown',{key:'Enter',preventDefault});
  assert.equal(elements.words.hidden,false);
  window.dispatch('blur');
  assert.equal(elements.words.hidden,true);
  cover.dispatch('keydown',{key:'Enter',preventDefault});
  cover.dispatch('blur');
  assert.equal(elements.words.hidden,true);
  cover.dispatch('keydown',{key:' ',preventDefault});
  document.visibilityState='hidden';
  document.dispatch('visibilitychange');
  assert.equal(elements.words.hidden,true);
  assert.ok(prevented>=3);
});

test('new list hides words again, including menu jumps',async()=>{
  const {elements,store}=await runApp();
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:1,pointerType:'touch'});
  assert.equal(elements.words.hidden,false);
  elements.next.dispatch('click');
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,false);
  assert.equal(JSON.parse(store.get('25words-progress-v2')).positions['pack-1'],1);
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:2,pointerType:'touch'});
  assert.equal(elements.words.hidden,false);
  elements['menu-toggle'].dispatch('click');
  elements['list-options'].children[41].dispatch('click');
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,false);
  assert.equal(elements.counter.textContent,'List 42 of 100');
});

test('restored progress is hidden until tapped; escape closes the menu',async()=>{
  const {elements,document}=await runApp({savedIndex:49});
  assert.equal(elements.counter.textContent,'List 50 of 100');
  assert.equal(elements.words.hidden,true);
  elements['menu-toggle'].dispatch('click');
  document.dispatch('keydown',{key:'Escape'});
  assert.equal(elements['list-menu'].hidden,true);
});

test('completed lists can be revisited and revealed',async()=>{
  const {elements}=await runApp({savedIndex:99});
  elements.next.dispatch('click');
  assert.equal(elements.counter.textContent,'All lists completed');
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,true);
  elements['menu-toggle'].dispatch('click');
  elements['list-options'].children[9].dispatch('click');
  assert.equal(elements.counter.textContent,'List 10 of 100');
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,false);
});

test('load failure does not expose words or enable menu',async()=>{
  const {elements}=await runApp({failing:true});
  assert.equal(elements.counter.textContent,'Unable to load packs');
  assert.equal(elements['reveal-cover'].hidden,true);
  assert.equal(elements['menu-toggle'].disabled,true);
});


test('outer background shifts pastel gradient when moving to a new list',async()=>{
  const {elements}=await runApp();
  const front=elements['round-backdrop-a'];
  const back=elements['round-backdrop-b'];
  const first=front.style.backgroundImage;
  assert.match(first,/linear-gradient\(/);
  assert.equal(front.style.opacity,'1');
  assert.equal(back.style.opacity,'0');

  // Revealing and hiding the same list does not alter the backdrop.
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:1,pointerType:'touch'});
  elements['reveal-cover'].dispatch('pointerup',{pointerId:1});
  assert.equal(front.style.backgroundImage,first);

  elements.next.dispatch('click');
  const second=back.style.backgroundImage;
  assert.notEqual(second,first);
  assert.equal(front.style.opacity,'0');
  assert.equal(back.style.opacity,'1');

  elements['menu-toggle'].dispatch('click');
  elements['list-options'].children[2].dispatch('click');
  assert.equal(front.style.opacity,'1');
  assert.equal(back.style.opacity,'0');
  assert.notEqual(front.style.backgroundImage,second);
});

test('saved list position recreates same colour; finishing does not shift',async()=>{
  const {elements}=await runApp({savedIndex:7});
  const last=elements['round-backdrop-a'].style.backgroundImage;
  assert.match(last,/linear-gradient\(/);
  elements.next.dispatch('click');
  const after=elements['round-backdrop-b'].style.backgroundImage;
  assert.notEqual(last,after);

  const restored=await runApp({savedIndex:8});
  assert.equal(restored.elements['round-backdrop-a'].style.backgroundImage,after);

  const final=await runApp({savedIndex:99});
  const colour=final.elements['round-backdrop-a'].style.backgroundImage;
  final.elements.next.dispatch('click');
  assert.equal(final.elements['round-backdrop-a'].style.backgroundImage,colour);
  assert.equal(final.elements['round-backdrop-b'].style.opacity,'0');
});

test('word stage reserves a fixed area independent of revealing content',()=>{
  assert.match(html,/\\.word-stage\\s*\\{\\s*position:\\s*relative;\\s*height:\\s*clamp\\(220px, 31dvh, 265px\\);\\s*\\}/);
  assert.match(html,/#words\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(html,/\.reveal-cover\s*\{[^}]*position:\s*absolute;[^}]*height:\s*100%;/s);
  assert.doesNotMatch(html,/\.word-stage\s*\{[^}]*min-height:/);
});

test('round gradients have stronger pastel colours and remain distinctive', async()=>{
  const {elements}=await runApp();
  const gradients=[];
  for(let i=0;i<8;i++){
    if(i>0) elements.next.dispatch('click');
    const layer=elements['round-backdrop-'+(i%2===0?'a':'b')];
    gradients.push(layer.style.backgroundImage);
    assert.match(layer.style.backgroundImage,/linear-gradient\(135deg, #[a-f\d]{6} 0%/);
  }
  assert.equal(new Set(gradients).size,8);
  assert.match(gradients[0],/#f4a59b/);
  assert.match(gradients[4],/#e99fc6/);
});

test('pack selector renders the shared catalogue and viewed lists remain selectable', async () => {
  const {elements,store} = await runApp();
  assert.equal(elements['pack-options'].children.length,1);
  assert.equal(elements['pack-options'].children[0].textContent,'Pack 1');
  assert.equal(elements['viewed-count'].textContent,'0 of 100 viewed');
  const cover = elements['reveal-cover'];
  cover.dispatch('pointerdown',{pointerId:33,pointerType:'touch'});
  assert.equal(elements['list-options'].children[0].getAttribute('data-viewed'),'true');
  assert.equal(elements['list-options'].children[0].getAttribute('aria-label'),'Go to list 1, viewed');
  assert.equal(elements['viewed-indicator'].hidden,false);
  assert.equal(elements['viewed-count'].textContent,'1 of 100 viewed');
  cover.dispatch('pointerup',{pointerId:33});
  elements.next.dispatch('click');
  assert.equal(elements['viewed-indicator'].hidden,true);
  assert.equal(elements['list-options'].children[1].getAttribute('data-viewed'),null);
  elements['menu-toggle'].dispatch('click');
  elements['list-options'].children[0].dispatch('click');
  assert.equal(elements.counter.textContent,'List 1 of 100');
  assert.equal(elements['viewed-indicator'].hidden,false);
  assert.deepEqual(JSON.parse(store.get('25words-progress-v2')).viewed['pack-1'],['list_1']);
});

test('existing position is migrated without inventing previously viewed lists',async()=>{
  const {elements,store} = await runApp({savedIndex:57});
  assert.equal(elements.counter.textContent,'List 58 of 100');
  assert.equal(elements['viewed-count'].textContent,'0 of 100 viewed');
  assert.deepEqual(JSON.parse(store.get('25words-progress-v2')).viewed,{});
});

test('viewed status and position persist in browser storage across restarts',async()=>{
  const first = await runApp();
  first.elements['reveal-cover'].dispatch('pointerdown',{pointerId:8,pointerType:'touch'});
  first.elements['reveal-cover'].dispatch('pointerup',{pointerId:8});
  first.elements.next.dispatch('click');
  const savedProgress=JSON.parse(first.store.get('25words-progress-v2'));
  const second=await runApp({savedProgress});
  assert.equal(second.elements.counter.textContent,'List 2 of 100');
  assert.equal(second.elements['list-options'].children[0].getAttribute('data-viewed'),'true');
  assert.equal(second.elements['list-options'].children[1].getAttribute('data-viewed'),null);
});

test('switching packs tracks position and viewed lists independently',async()=>{
  const {elements,store}=await runApp({secondPack:true});
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:1,pointerType:'touch'});
  elements['reveal-cover'].dispatch('pointerup',{pointerId:1});
  elements['menu-toggle'].dispatch('click');
  elements['pack-options'].children[1].dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements['pack-label'].textContent,'Pack 2');
  assert.equal(elements.counter.textContent,'List 1 of 2');
  assert.equal(elements['viewed-count'].textContent,'0 of 2 viewed');
  assert.equal(elements['list-options'].children.length,2);
  elements.next.dispatch('click');
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:2,pointerType:'touch'});
  elements['reveal-cover'].dispatch('pointerup',{pointerId:2});
  elements['pack-options'].children[0].dispatch('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(elements.counter.textContent,'List 1 of 100');
  assert.equal(elements['list-options'].children[0].getAttribute('data-viewed'),'true');
  const progress=JSON.parse(store.get('25words-progress-v2'));
  assert.equal(progress.positions['pack-1'],0);
  assert.equal(progress.positions['pack-2'],1);
  assert.deepEqual(progress.viewed['pack-1'],['list_1']);
  assert.deepEqual(progress.viewed['pack-2'],['extra_2']);
});

test('no user progress is written to Supabase',async()=>{
  const {elements,store}=await runApp();
  elements['reveal-cover'].dispatch('pointerdown',{pointerId:3,pointerType:'touch'});
  assert.ok(store.has('25words-progress-v2'));
  assert.doesNotMatch(script,/method:\s*['"](?:POST|PATCH|PUT|DELETE)/);
});


test('tally starts at zero, increments, subtracts and resets with background updates', async () => {
  assert.match(html, /id="tap-count"/);
  assert.match(html, /id="tap-undo"/);
  assert.match(html, /id="tap-reset"/);
  const { elements } = await runApp();
  const count = elements['tap-count'];
  const number = elements['tap-number'];
  const undo = elements['tap-undo'];
  const reset = elements['tap-reset'];
  assert.equal(number.textContent, '0');
  assert.equal(undo.disabled, true);
  assert.equal(reset.disabled, true);
  const initialGradient = elements['round-backdrop-a'].style.backgroundImage;
  count.dispatch('click');
  assert.equal(number.textContent, '1');
  assert.equal(undo.disabled, false);
  assert.equal(reset.disabled, false);
  assert.notEqual(elements['round-backdrop-b'].style.backgroundImage, initialGradient);
  count.dispatch('click');
  assert.equal(number.textContent, '2');
  undo.dispatch('click');
  assert.equal(number.textContent, '1');
  reset.dispatch('click');
  assert.equal(number.textContent, '0');
  assert.equal(undo.disabled, true);
  assert.equal(reset.disabled, true);
  undo.dispatch('click');
  assert.equal(number.textContent, '0');
});

test('tally persists with viewed lists and active list position across restart', async () => {
  const first = await runApp();
  first.elements['tap-count'].dispatch('click');
  first.elements['tap-count'].dispatch('click');
  first.elements['tap-count'].dispatch('click');
  first.elements['reveal-cover'].dispatch('pointerdown', {pointerId: 17, pointerType: 'touch'});
  first.elements['reveal-cover'].dispatch('pointerup', {pointerId: 17});
  first.elements.next.dispatch('click');

  const savedProgress = JSON.parse(first.store.get('25words-progress-v2'));
  assert.equal(savedProgress.tally, 3);
  assert.equal(savedProgress.positions['pack-1'], 1);
  assert.deepEqual(savedProgress.viewed['pack-1'], ['list_1']);

  const second = await runApp({savedProgress});
  assert.equal(second.elements['tap-number'].textContent, '3');
  assert.equal(second.elements['tap-undo'].disabled, false);
  assert.equal(second.elements['tap-reset'].disabled, false);
  assert.equal(second.elements.counter.textContent, 'List 2 of 100');
  assert.equal(second.elements['list-options'].children[0].getAttribute('data-viewed'), 'true');
  // Restoring does not mutate the previously saved progress.
  assert.equal(JSON.parse(second.store.get('25words-progress-v2')).tally, 3);

  second.elements['tap-undo'].dispatch('click');
  assert.equal(JSON.parse(second.store.get('25words-progress-v2')).tally, 2);
  second.elements['tap-reset'].dispatch('click');
  assert.equal(JSON.parse(second.store.get('25words-progress-v2')).tally, 0);

  const third = await runApp({savedProgress: JSON.parse(second.store.get('25words-progress-v2'))});
  assert.equal(third.elements['tap-number'].textContent, '0');
  assert.equal(third.elements.counter.textContent, 'List 2 of 100');
  assert.equal(third.elements['list-options'].children[0].getAttribute('data-viewed'), 'true');
});

test('older saved progress and invalid saved tallies default to zero without losing list progress', async () => {
  const base = {activePackId: 'pack-1', positions: {'pack-1': 21}, viewed: {'pack-1': ['list_1']}};
  for (const tally of [undefined, -1, 1.5, '17', null, Number.MAX_SAFE_INTEGER + 1]) {
    const savedProgress = {...base};
    if (tally !== undefined) savedProgress.tally = tally;
    const {elements, store} = await runApp({savedProgress});
    assert.equal(elements['tap-number'].textContent, '0');
    assert.equal(elements['tap-undo'].disabled, true);
    assert.equal(elements.counter.textContent, 'List 22 of 100');
    assert.equal(elements['list-options'].children[0].getAttribute('data-viewed'), 'true');
    assert.equal(JSON.parse(store.get('25words-progress-v2')).tally, 0);
  }
});

test('tally is shared across pack selection and persists independently of pack position', async () => {
  const first = await runApp({secondPack: true});
  first.elements['tap-count'].dispatch('click');
  first.elements['tap-count'].dispatch('click');
  first.elements['menu-toggle'].dispatch('click');
  first.elements['pack-options'].children[1].dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(first.elements['tap-number'].textContent, '2');
  first.elements.next.dispatch('click');
  const saved = JSON.parse(first.store.get('25words-progress-v2'));
  assert.equal(saved.tally, 2);
  assert.equal(saved.activePackId, 'pack-2');
  assert.equal(saved.positions['pack-2'], 1);
  const restored = await runApp({secondPack: true, savedProgress: saved});
  assert.equal(restored.elements['tap-number'].textContent, '2');
  assert.equal(restored.elements.counter.textContent, 'List 2 of 2');
});

test('tally buttons are stacked at the left edge, outside the central counter target', () => {
  assert.match(html, /\.tap-counter \{ position: relative;/);
  assert.match(html, /\\.tap-controls \\{[^}]*left: 18px;[^}]*flex-direction: column;/);
  assert.match(html, /\\.tap-control \\{[^}]*border-radius: 12px;[^}]*background: #ffffff54;/);
  assert.match(html, /id="tap-undo"[^>]*aria-label="Subtract one"/);
  assert.match(html, /id="tap-reset"[^>]*aria-label="Reset counter to zero"/);
});

test('iOS uses automatic status-bar colour and the changing page backdrop', async () => {
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /apple-mobile-web-app-status-bar-style/);
  assert.doesNotMatch(html, /<meta name="theme-color"/);
  assert.ok(html.includes(':root { color-scheme: light; background-color: #f4a59b; }'));
  const {elements,document} = await runApp();
  const expectBackground = colour => {
    assert.equal(document.documentElement.style.backgroundColor, colour);
    assert.equal(document.body.style.backgroundColor, colour);
  };
  expectBackground('#f4a59b');
  elements['tap-count'].dispatch('click');
  expectBackground('#a7b9f5');
  elements.next.dispatch('click');
  expectBackground('#91d1bb');
  elements['tap-undo'].dispatch('click');
  expectBackground('#a7b9f5');
  elements['tap-reset'].dispatch('click');
  expectBackground('#a7b9f5');
});
