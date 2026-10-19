'use strict';

const URL = 'https://psoncybkfsdmjksyrcvv.supabase.co';
const KEY = 'sb_publishable_z-Aumyx5v_WMPTbY77u88A_H3oEEzFH';
const storageKey = '25words-progress-v2';
const legacyStorageKey = '25words-progress-v1';

const header = document.getElementById('header');
const tapCountButton = document.getElementById('tap-count');
const tapNumber = document.getElementById('tap-number');
const tapUndo = document.getElementById('tap-undo');
const tapReset = document.getElementById('tap-reset');
let tally = 0;
const counter = document.getElementById('counter');
const words = document.getElementById('words');
const revealCover = document.getElementById('reveal-cover');
const next = document.getElementById('next');
const status = document.getElementById('status');
const menuToggle = document.getElementById('menu-toggle');
const listMenu = document.getElementById('list-menu');
const listOptions = document.getElementById('list-options');
const packOptions = document.getElementById('pack-options');
const viewedIndicator = document.getElementById('viewed-indicator');
const viewedCount = document.getElementById('viewed-count');
const backdropLayers = [
  document.getElementById('round-backdrop-a'),
  document.getElementById('round-backdrop-b')
];

// Richer but still soft gradients. Each list has a repeatable palette, so Next
// and direct selection reliably show a different backdrop from the last list.
const roundGradients = [
  'linear-gradient(135deg, #f4a59b 0%, #f7c4a4 55%, #d4b1e9 100%)', // peach coral
  'linear-gradient(135deg, #a7b9f5 0%, #b7d8f3 55%, #b5cae9 100%)', // lilac blue
  'linear-gradient(135deg, #91d1bb 0%, #b9e3a4 55%, #d7d997 100%)', // sage mint
  'linear-gradient(135deg, #f8d37e 0%, #f4b2a4 52%, #edadc5 100%)', // butter coral
  'linear-gradient(135deg, #e99fc6 0%, #eab8da 55%, #cab2ee 100%)', // blush
  'linear-gradient(135deg, #91cee2 0%, #93dbc8 55%, #b5d9b1 100%)', // sea glass
  'linear-gradient(135deg, #c2a3e9 0%, #dda8d0 55%, #f2c09d 100%)', // orchid
  'linear-gradient(135deg, #9cbfed 0%, #bec0ee 55%, #e8ce9f 100%)'  // periwinkle
];
let currentBackdropLayer = 0;
let lastBackgroundKey = null;

function updateRoundBackground() {
  if (index >= lists.length) return;
  const key = activePackId + ':' + index + ':' + tally;
  if (key === lastBackgroundKey) return;
  const packOffset = Math.max(0, packs.findIndex(pack => pack.id === activePackId)) * 3;
  const gradient = roundGradients[(index + packOffset + tally) % roundGradients.length];
  // iOS Home Screen apps may render their own opaque status bar instead of
  // letting the webpage paint underneath it. Keep both root backgrounds in
  // sync with the gradient's top colour for Safari's automatic sampling.
  // Avoid fixed theme-color or legacy translucent status-bar hints: those
  // can leave a stale, differently coloured strip as the tally changes.
  const topColour = gradient.match(/#[a-f\d]{6}/i)[0];
  document.documentElement.style.backgroundColor = topColour;
  document.body.style.backgroundColor = topColour;
  if (lastBackgroundKey === null) {
    backdropLayers[0].style.backgroundImage = gradient;
    backdropLayers[0].style.opacity = '1';
    backdropLayers[1].style.opacity = '0';
  } else {
    const incoming = 1 - currentBackdropLayer;
    backdropLayers[incoming].style.backgroundImage = gradient;
    backdropLayers[incoming].style.opacity = '1';
    backdropLayers[currentBackdropLayer].style.opacity = '0';
    currentBackdropLayer = incoming;
  }
  lastBackgroundKey = key;
}

function changeTally(value) {
  const nextValue = Math.max(0, value);
  if (nextValue === tally) return;
  const previous = tally;
  tally = nextValue;
  progress.tally = tally;
  saveProgress();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  tapNumber.textContent = String(tally);
  tapUndo.disabled = tally === 0;
  tapReset.disabled = tally === 0;
  if (!reducedMotion) {
    const ghost = document.createElement('span');
    ghost.className = 'tap-ghost';
    ghost.textContent = String(previous);
    ghost.setAttribute('aria-hidden', 'true');
    tapCountButton.appendChild(ghost);
    ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    tapNumber.classList.remove('animate');
    void tapNumber.offsetWidth;
    tapNumber.classList.add('animate');
  }
  updateRoundBackground();
}

tapCountButton.addEventListener('click', () => changeTally(tally + 1));
tapUndo.addEventListener('click', () => changeTally(tally - 1));
tapReset.addEventListener('click', () => changeTally(0));

let packs = [];
let activePackId = null;
let lists = [];
let index = 0;
let requestNumber = 0;
let progress = readProgress();
// Restore the counter alongside the saved pack, position and viewed history.
// Restoring it must not trigger an animation or overwrite existing progress.
tally = progress.tally;
tapNumber.textContent = String(tally);
tapUndo.disabled = tally === 0;
tapReset.disabled = tally === 0;
let activePointer = null;
let activeKey = null;

function hideWords() {
  activePointer = null;
  activeKey = null;
  words.hidden = true;
  revealCover.removeAttribute('data-revealing');
  revealCover.setAttribute('aria-pressed', 'false');
}

function showWords() {
  if (index >= lists.length) return;
  words.hidden = false;
  markViewed();
  // Never hide the cover element while held: it must keep receiving pointerup.
  revealCover.setAttribute('data-revealing', 'true');
  revealCover.setAttribute('aria-pressed', 'true');
}


function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      return {
        activePackId: typeof saved.activePackId === 'string' ? saved.activePackId : 'pack-1',
        positions: saved.positions && typeof saved.positions === 'object' ? saved.positions : {},
        viewed: saved.viewed && typeof saved.viewed === 'object' ? saved.viewed : {},
        tally: Number.isSafeInteger(saved.tally) && saved.tally >= 0 ? saved.tally : 0
      };
    }
  } catch (_) { /* Old or malformed progress must not break the game. */ }
  let legacyIndex = 0;
  try {
    const value = Number(localStorage.getItem(legacyStorageKey));
    if (Number.isSafeInteger(value) && value >= 0) legacyIndex = value;
  } catch (_) {}
  // The old version stored a position, not a viewed-list history. Do not
  // falsely label earlier lists as viewed just because the index is high.
  return { activePackId: 'pack-1', positions: { 'pack-1': legacyIndex }, viewed: {}, tally: 0 };
}

function saveProgress() {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch (_) {
    // Safari private browsing or storage restrictions should not stop gameplay.
  }
}

function savePosition() {
  if (activePackId === null) return;
  progress.activePackId = activePackId;
  progress.positions[activePackId] = index;
  saveProgress();
}

function activePack() {
  return packs.find(pack => pack.id === activePackId);
}

function hasViewed(list) {
  const viewed = progress.viewed[activePackId];
  return Array.isArray(viewed) && viewed.includes(list.id);
}

function updateViewedUI() {
  for (const [position, choice] of Array.from(listOptions.children).entries()) {
    const list = lists[position];
    const viewed = hasViewed(list);
    if (position === index) choice.setAttribute('aria-current', 'true');
    else choice.removeAttribute('aria-current');
    if (viewed) choice.setAttribute('data-viewed', 'true');
    else choice.removeAttribute('data-viewed');
    choice.setAttribute('aria-label', 'Go to list ' + list.sequence + (viewed ? ', viewed' : ', not viewed'));
  }
  const viewedTotal = lists.filter(hasViewed).length;
  viewedCount.textContent = viewedTotal + ' of ' + lists.length + ' viewed';
  viewedIndicator.hidden = index >= lists.length || !hasViewed(lists[index]);
}

function markViewed() {
  if (index >= lists.length) return;
  const list = lists[index];
  if (hasViewed(list)) return;
  if (!Array.isArray(progress.viewed[activePackId])) progress.viewed[activePackId] = [];
  progress.viewed[activePackId].push(list.id);
  saveProgress();
  updateViewedUI();
}

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

function render() {
  hideWords();
  updateRoundBackground();
  updateViewedUI();

  if (index >= lists.length) {
    counter.textContent = activePack().title + ' · All lists completed';
    words.replaceChildren();
    words.hidden = true;
    revealCover.hidden = true;
    next.disabled = true;
    status.textContent = 'You have finished all available lists in this pack.';
    return;
  }

  const list = lists[index];
  counter.textContent = activePack().title + ' · List ' + list.sequence + ' of ' + lists.length;
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
  if (!Number.isInteger(position) || position < 0 || position >= lists.length) return;
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
    choice.addEventListener('click', () => selectList(position));
    return choice;
  }));
  updateViewedUI();
  menuToggle.disabled = false;
}

function buildPackSelector() {
  packOptions.replaceChildren(...packs.map(pack => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'pack-choice';
    choice.textContent = pack.title;
    if (pack.id === activePackId) choice.setAttribute('aria-current', 'true');
    choice.addEventListener('click', () => {
      if (pack.id === activePackId) return;
      loadPack(pack.id).then(ok => {
        if (ok && !listMenu.hidden && listOptions.firstElementChild) {
          listOptions.firstElementChild.focus({ preventScroll: true });
        }
      });
    });
    return choice;
  }));
}

async function loadPack(packId) {
  const pack = packs.find(p => p.id === packId);
  if (!pack) return false;
  const thisRequest = ++requestNumber;
  const oldMenuDisabled = menuToggle.disabled;
  menuToggle.disabled = true;
  next.disabled = true;
  status.textContent = 'Loading ' + pack.title + '…';
  try {
    const query = '/rest/v1/twentyfive_pack_entries?select=position,twentyfive_word_lists(id,words)' +
      '&pack_id=eq.' + encodeURIComponent(packId) + '&order=position.asc';
    const response = await fetch(URL + query, { headers: { apikey: KEY } });
    if (!response.ok) throw new Error('Database error ' + response.status);
    const rows = await response.json();
    const loaded = rows.map(row => ({
      id: row.twentyfive_word_lists?.id,
      sequence: row.position,
      words: row.twentyfive_word_lists?.words
    }));
    if (!loaded.length || loaded.some(item => !item.id || !Array.isArray(item.words) || item.words.length !== 10)) {
      throw new Error('No valid word lists found in this pack.');
    }
    if (thisRequest !== requestNumber) return false;
    activePackId = packId;
    lists = loaded;
    const storedIndex = Number(progress.positions[packId]);
    index = Number.isSafeInteger(storedIndex) ? Math.min(Math.max(0, storedIndex), lists.length) : 0;
    savePosition();
    buildPackSelector();
    buildListSelector();
    render();
    return true;
  } catch (error) {
    if (thisRequest === requestNumber) {
      menuToggle.disabled = oldMenuDisabled;
      next.disabled = activePackId === null || index >= lists.length;
      counter.textContent = activePackId === null ? 'Unable to load lists' : counter.textContent;
      status.textContent = error.message;
    }
    return false;
  }
}

revealCover.addEventListener('pointerdown', event => {
  if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
  if (activePointer !== null || activeKey !== null || index >= lists.length) return;
  // Suppress the browser's native selection/drag gesture before showing words.
  event.preventDefault();
  activePointer = event.pointerId;
  // Pointer capture keeps release events attached to the cover even if the
  // finger moves away from it before the user releases.
  try { revealCover.setPointerCapture?.(event.pointerId); } catch (_) {}
  showWords();
});

function releasePointer(event) {
  if (activePointer !== null && event.pointerId === activePointer) hideWords();
}
revealCover.addEventListener('pointerup', releasePointer);
revealCover.addEventListener('pointercancel', releasePointer);
revealCover.addEventListener('lostpointercapture', releasePointer);

revealCover.addEventListener('keydown', event => {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  if (activeKey === null && activePointer === null && index < lists.length) {
    activeKey = event.key;
    showWords();
  }
});
revealCover.addEventListener('keyup', event => {
  if (event.key === activeKey) {
    event.preventDefault();
    hideWords();
  }
});
revealCover.addEventListener('blur', hideWords);
revealCover.addEventListener('contextmenu', event => event.preventDefault());
// iOS Safari can initiate selection on the revealed words or child spans even
// when user-select:none is applied. Guard all controls, not just the overlay.
for (const type of ['selectstart', 'dragstart']) {
  document.addEventListener(type, event => {
    if (event.target?.closest?.('.panel')) event.preventDefault();
  });
}
window.addEventListener('blur', hideWords);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hideWords();
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
    const response = await fetch(URL + '/rest/v1/twentyfive_packs?select=id,title,sort_order&order=sort_order.asc', {
      headers: { apikey: KEY }
    });
    if (!response.ok) throw new Error('Database error ' + response.status);
    packs = await response.json();
    if (!packs.length) throw new Error('No packs available.');
    const preferredId = packs.some(pack => pack.id === progress.activePackId)
      ? progress.activePackId : packs[0].id;
    await loadPack(preferredId);
  } catch (error) {
    counter.textContent = 'Unable to load packs';
    status.textContent = error.message;
  }
})();
