// Run with: node --experimental-strip-types scripts/test-quiz.mts
import assert from 'node:assert/strict';
import { pickSimilarLength } from '../lib/distractors.ts';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('  ok -', name); };
const words = (k: number, word = 'word') => Array.from({ length: k }, () => word).join(' ');

// A real question from a generated "human heart" set: the AI's wrong answers
// were all much shorter, so the right one was obviously the longest.
const answer =
  'Increased ventricular filling stretches myocardial fibers, producing stronger contractions and greater stroke volume.';
const aiWrong = [
  'Decreases heart rate when blood pressure rises.',
  'Reduces oxygen consumption by the myocardium during rest.',
  'Triggers immediate valve closure during diastole.',
];
const otherCards = [
  'The aortic valve sits between the left ventricle and the aorta, controlling blood outflow to systemic circulation.',
  'The superior vena cava returns deoxygenated blood from the upper body to the right atrium.',
  'The septum separates the heart\'s left and right chambers, preventing mixing of oxygenated and deoxygenated blood.',
  'Adults typically have 60–100 beats per minute at rest.',
];

t('the right answer no longer stands out as the longest', () => {
  const picked = pickSimilarLength(answer, aiWrong, otherCards, 3);
  assert.equal(picked.length, 3);
  for (const p of picked) {
    assert.ok(p.length >= answer.length * 0.75, `too short to be a fair option: ${p}`);
  }
});

t('AI-written wrong answers are used when they are about as long', () => {
  const ai = [words(10), words(11), words(9)];
  const picked = pickSimilarLength(words(10), ai, [words(10, 'card'), words(10, 'deck')], 3);
  assert.deepEqual([...picked].sort(), [...ai].sort());
});

t('other cards fill in when the AI answers are clearly shorter', () => {
  const short = words(5, 'tiny');
  const picked = pickSimilarLength(words(20), [short], [words(19), words(21), words(20, 'card')], 3);
  assert.ok(!picked.includes(short));
});

t('returns what it can when there are few candidates', () => {
  assert.deepEqual(pickSimilarLength('abc', [], ['abd'], 3), ['abd']);
  assert.deepEqual(pickSimilarLength('abc', [], [], 3), []);
});

t('equally good candidates come out in varying order', () => {
  const pool = ['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee'];
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) seen.add(pickSimilarLength('zzzz', [], pool, 1).join());
  assert.ok(seen.size > 1);
});

t('a seeded random gives the same pick', () => {
  const seq = () => { let x = 0; return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const pool = ['aaaa', 'bbbb', 'cccc', 'dddd'];
  assert.deepEqual(pickSimilarLength('zzzz', [], pool, 2, seq()), pickSimilarLength('zzzz', [], pool, 2, seq()));
});

console.log(`${n} quiz option tests passed`);
