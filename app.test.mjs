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
  }
  get firstElementChild() { return this.children[0]; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(key, fn) {
    if (!this.listeners.has(key)) this.listeners.set(key, []);
    this.listeners.get(key).push(fn);
  }
  dispatch(key, event = {}) {
    for (const fn of this.listeners.get(key) ?? []) fn({ target: this, ...event });
  }
  focus() { this.focused = true; }
  scrollIntoView() {}
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
  contains(node) { return node === this || this.children.some(c => c.contains(node)); }
}

async function runApp({ savedIndex = null, count = 100, failing = false } = {}) {
  const ids = ['header','counter','words','reveal-cover','next','status','menu-toggle','list-menu','list-options','round-backdrop-a','round-backdrop-b'];
  const elements = Object.fromEntries(ids.map(id => [id,new FakeElement()]));
  elements.header.replaceChildren(elements['menu-toggle'], elements['list-menu']);
  elements['list-menu'].replaceChildren(elements['list-options']);
  elements['list-menu'].hidden = true;
  elements.words.hidden = true;
  elements['reveal-cover'].hidden = true;
  elements['menu-toggle'].disabled = true;
  elements.next.disabled = true;

  const document = new FakeElement();
  document.createElement = () => new FakeElement();
  document.getElementById = id => elements[id];
  const store = new Map(savedIndex === null ? [] : [['25words-progress-v1', String(savedIndex)]]);
  const localStorage = {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  const lists = Array.from({length:count},(_,i)=>({
    id: 'list_'+(i+1),
    sequence:i+1,
    words: Array.from({length:10},(_,w)=>'word'+(i+1)+'_'+(w+1))
  }));
  const fetch = async () => failing
    ? {ok:false,status:503}
    : {ok:true,json:async()=>lists};
  const window = new FakeElement();
  runInNewContext(script,{document,window,localStorage,fetch});
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,document,window,store};
}

test('menu and reveal button are present and accessible',()=>{
  assert.match(html,/id="menu-toggle"[^>]+aria-controls="list-menu"/);
  assert.match(html,/id="list-menu"[^>]+hidden/);
  assert.match(html,/id="reveal-cover"[^>]+aria-controls="words"/);
  assert.match(html,/Press and hold to reveal words/);
  assert.match(html,/class="round-backdrop" aria-hidden="true"/);
  assert.match(html,/prefers-reduced-motion: reduce/);
  assert.match(html,/\.panel \{\s*position: relative;\s*z-index: 1;/);
  assert.match(html,/data-revealing="true"/);
  assert.match(html,/<ol id="words" hidden>/);
  assert.match(html,/src=".\/app.js"/);
  assert.match(script,/twentyfive_word_lists/);
});

test('menu selects any of 100 lists and saves navigation',async()=>{
  const {elements,store}=await runApp();
  assert.equal(elements['list-options'].children.length,100);
  assert.equal(elements['menu-toggle'].disabled,false);
  elements['menu-toggle'].dispatch('click');
  assert.equal(elements['list-menu'].hidden,false);
  elements['list-options'].children[26].dispatch('click');
  assert.equal(elements.counter.textContent,'List 27 of 100');
  assert.equal(elements['list-menu'].hidden,true);
  assert.equal(store.get('25words-progress-v1'),'26');
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
  assert.equal(store.get('25words-progress-v1'),'1');
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
  assert.equal(elements.counter.textContent,'Unable to load lists');
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
  assert.match(html,/\.word-stage\s*\{\s*position:\s*relative;\s*height:\s*260px;\s*\}/);
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
