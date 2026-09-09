/**
 * The number the resource board rests on. It shipped wrong once — taking the
 * largest single booking rather than what is actually concurrent — so it is
 * tested against the cases that distinguish the three plausible answers.
 */
import assert from 'node:assert/strict';
import { peakConcurrent } from '../dist/index.js';

const at = (h) => new Date(`2026-09-09T${String(h).padStart(2, '0')}:00:00Z`).getTime();
const span = (from, to, quantity = 1) => ({ start: at(from), end: at(to), quantity });

// Nothing committed.
assert.equal(peakConcurrent([]), 0);

// One booking is one.
assert.equal(peakConcurrent([span(9, 10)]), 1);

// The bug: two events at the same hour, one each, need two — not one.
assert.equal(peakConcurrent([span(9, 10), span(9, 10)]), 2);

// The opposite error: a chain across a morning. A meets B and B meets C, but A
// never meets C, so two suffice — a plain sum would say three.
assert.equal(peakConcurrent([span(9, 10), span(9.5 | 0, 11), span(10, 12)]), 2);

// Back to back is not concurrent: an end and a start at the same instant.
assert.equal(peakConcurrent([span(9, 10), span(10, 11)]), 1);

// Quantities add within a moment.
assert.equal(peakConcurrent([span(9, 12, 3), span(10, 11, 4)]), 7);

// A long booking spanning several short ones.
assert.equal(peakConcurrent([span(8, 18, 1), span(9, 10, 1), span(11, 12, 1)]), 2);

console.log('✔ peakConcurrent: 7 cases pass');
