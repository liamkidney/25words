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
  contains(node) { return node === this || this.children.some(c => c.contains(node)); }
}

async function runApp({ savedIndex = null, count = 100, failing = false } = {}) {
  const ids = ['header','counter','words','reveal-cover','next','status','menu-toggle','list-menu','list-options'];
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
  runInNewContext(script,{document,localStorage,fetch});
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,document,store};
}

test('menu and reveal button are present and accessible',()=>{
  assert.match(html,/id="menu-toggle"[^>]+aria-controls="list-menu"/);
  assert.match(html,/id="list-menu"[^>]+hidden/);
  assert.match(html,/id="reveal-cover"[^>]+aria-controls="words"/);
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

test('words are covered by default and appear only on reveal',async()=>{
  const {elements}=await runApp();
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,false);
  elements['reveal-cover'].dispatch('click');
  assert.equal(elements.words.hidden,false);
  assert.equal(elements['reveal-cover'].hidden,true);
  assert.equal(elements.words.children.length,10);
});

test('new list hides words again, including menu jumps',async()=>{
  const {elements,store}=await runApp();
  elements['reveal-cover'].dispatch('click');
  elements.next.dispatch('click');
  assert.equal(elements.words.hidden,true);
  assert.equal(elements['reveal-cover'].hidden,false);
  assert.equal(store.get('25words-progress-v1'),'1');
  elements['reveal-cover'].dispatch('click');
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
