// Run with: npm run test:failover
import assert from 'node:assert/strict';
import {
  AllProvidersFailed,
  isUnusableOutput,
  resetCooldowns,
  runInTurn,
  UnusableOutput,
} from '../lib/failover.ts';

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  resetCooldowns();
  await fn();
  n++;
  console.log('  ok -', name);
};

// The failover logs every failure; keep the test output readable.
console.warn = () => {};
console.error = () => {};

const models = (...names: string[]) =>
  names.map((name) => ({ provider: 'p', model: name, make: () => name }));

/** Errors shaped like the ones the AI SDK and providers really throw. */
const groqBadJson = Object.assign(new Error('Generated JSON does not match the expected schema.'), {
  name: 'AI_APICallError',
  statusCode: 400,
  responseBody: '{"error":{"code":"json_validate_failed"}}',
});
const noObject = Object.assign(new Error('No object generated'), { name: 'AI_NoObjectGeneratedError' });
const rateLimit = Object.assign(new Error('Rate limit'), {
  name: 'AI_APICallError',
  statusCode: 429,
  responseHeaders: { 'retry-after': '7' },
});
const wrapped = (inner: Error) => Object.assign(new Error('Failed after retries'), { name: 'AI_RetryError', lastError: inner });

await t('recognises unusable answers, wrapped or not', async () => {
  assert.equal(isUnusableOutput(groqBadJson), true);
  assert.equal(isUnusableOutput(noObject), true);
  assert.equal(isUnusableOutput(wrapped(noObject)), true);
  assert.equal(isUnusableOutput(new UnusableOutput('Too few valid cards')), true);
  assert.equal(isUnusableOutput(rateLimit), false);
  assert.equal(isUnusableOutput(new Error('fetch failed')), false);
});

await t('a malformed answer is retried once on the same model', async () => {
  const calls: string[] = [];
  const r = await runInTurn(models('a', 'b'), async (m) => {
    calls.push(m);
    if (calls.length === 1) throw groqBadJson;
    return 'cards';
  });
  assert.deepEqual(calls, ['a', 'a']);
  assert.equal(r.model, 'a');
  assert.equal(r.value, 'cards');
});

await t('a model that answers badly twice hands over to the next one', async () => {
  const calls: string[] = [];
  const r = await runInTurn(models('a', 'b'), async (m) => {
    calls.push(m);
    if (m === 'a') throw new UnusableOutput('Too few valid cards');
    return 'cards';
  });
  assert.deepEqual(calls, ['a', 'a', 'b']);
  assert.equal(r.model, 'b');
});

await t('a rate limit moves straight on, without a retry', async () => {
  const calls: string[] = [];
  await runInTurn(models('a', 'b'), async (m) => {
    calls.push(m);
    if (m === 'a') throw rateLimit;
    return 'ok';
  });
  assert.deepEqual(calls, ['a', 'b']);
});

await t('a model that just failed is skipped on the next request', async () => {
  await runInTurn(models('a', 'b'), async (m) => {
    if (m === 'a') throw rateLimit;
    return 'ok';
  });
  const calls: string[] = [];
  await runInTurn(models('a', 'b'), async (m) => {
    calls.push(m);
    return 'ok';
  });
  assert.deepEqual(calls, ['b']);
});

await t('one bad answer that a retry fixed does not bench the model', async () => {
  let first = true;
  await runInTurn(models('a', 'b'), async () => {
    if (first) {
      first = false;
      throw noObject;
    }
    return 'ok';
  });
  const calls: string[] = [];
  await runInTurn(models('a', 'b'), async (m) => {
    calls.push(m);
    return 'ok';
  });
  assert.deepEqual(calls, ['a']);
});

await t('when everything fails, the error lists each failure', async () => {
  await assert.rejects(
    runInTurn(models('a', 'b'), async () => {
      throw rateLimit;
    }),
    (err: unknown) => {
      assert.ok(err instanceof AllProvidersFailed);
      assert.deepEqual(
        err.failures.map((f) => [f.model, f.status, f.retryAfter]),
        [['a', 429, 7], ['b', 429, 7]]
      );
      return true;
    }
  );
});

console.log(`${n} failover tests passed`);
