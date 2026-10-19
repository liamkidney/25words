'use strict';

const URL = 'https://psoncybkfsdmjksyrcvv.supabase.co';
const KEY = 'sb_publishable_z-Aumyx5v_WMPTbY77u88A_H3oEEzFH';
const storageKey = '25words-progress-v1';

const header = document.getElementById('header');
const counter = document.getElementById('counter');
const words = document.getElementById('words');
const revealCover = document.getElementById('reveal-cover');
const next = document.getElementById('next');
const status = document.getElementById('status');
const menuToggle = document.getElementById('menu-toggle');
const listMenu = document.getElementById('list-menu');
const listOptions = document.getElementById('list-options');

let lists = [];
let index = 0;

function setMenuOpen(open) {
  listMenu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    const selected = listOptions.children[index] || listOptions.firstElementChild;
    if (selected) {
      selected.focus({ preventScroll: true });
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
}

function savePosition() {
  localStorage.setItem(storageKey, String(index));
}

function render() {
  for (const [position, choice] of Array.from(listOptions.children).entries()) {
    if (position === index) choice.setAttribute('aria-current', 'true');
    else choice.removeAttribute('aria-current');
  }

  if (index >= lists.length) {
    counter.textContent = 'All lists completed';
    words.replaceChildren();
    words.hidden = true;
    revealCover.hidden = true;
    next.disabled = true;
    status.textContent = 'You have finished all available lists.';
    return;
  }

  const list = lists[index];
  counter.textContent = 'List ' + list.sequence + ' of ' + lists.length;
  words.replaceChildren(...list.words.map(word => {
    const item = document.createElement('li');
    item.textContent = word;
    return item;
  }));
  words.hidden = true;
  revealCover.hidden = false;
  next.disabled = false;
  next.textContent = index === lists.length - 1 ? 'Finish' : 'Next list →';
  status.textContent = '';
}

function selectList(position) {
  index = position;
  savePosition();
  render();
  setMenuOpen(false);
  menuToggle.focus();
}

function buildListSelector() {
  listOptions.replaceChildren(...lists.map((list, position) => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'list-choice';
    choice.textContent = String(list.sequence);
    choice.setAttribute('aria-label', 'Go to list ' + list.sequence);
    choice.addEventListener('click', () => selectList(position));
    return choice;
  }));
  menuToggle.disabled = false;
}

revealCover.addEventListener('click', () => {
  if (index >= lists.length) return;
  words.hidden = false;
  revealCover.hidden = true;
});

menuToggle.addEventListener('click', () => setMenuOpen(listMenu.hidden));
next.addEventListener('click', () => {
  if (index >= lists.length) return;
  index += 1;
  savePosition();
  render();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !listMenu.hidden) {
    setMenuOpen(false);
    menuToggle.focus();
  }
});
document.addEventListener('pointerdown', event => {
  if (!listMenu.hidden && !header.contains(event.target)) setMenuOpen(false);
});

(async () => {
  try {
    const response = await fetch(URL + '/rest/v1/twentyfive_word_lists?select=id,sequence,words&order=sequence.asc', {
      headers: { apikey: KEY }
    });
    if (!response.ok) throw new Error('Database error ' + response.status);
    lists = await response.json();
    if (!lists.length) throw new Error('No word lists loaded.');
    const storedIndex = Number(localStorage.getItem(storageKey)) || 0;
    index = Math.min(Math.max(0, storedIndex), lists.length);
    buildListSelector();
    render();
  } catch (error) {
    counter.textContent = 'Unable to load lists';
    status.textContent = error.message;
  }
})();
