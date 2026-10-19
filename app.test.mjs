import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
test('renders next-list interface',()=>{assert.match(html,/Next list/);assert.match(html,/twentyfive_word_lists/);assert.match(html,/localStorage/)});
