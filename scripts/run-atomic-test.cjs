// 原子性专项：模拟 localStorage 配额写入失败，验证“评价、公开状态、信用分”全部不变。
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { createRequire } = require('node:module');
const esbuildPkg = path.join(__dirname, '..', 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild');
const esbuild = createRequire(path.join(esbuildPkg, 'x.js'))(esbuildPkg);

const polyfill = `
const memory = new Map();
let failNext = false;
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => {
    if (failNext) { failNext = false; throw new Error('QuotaExceededError'); }
    memory.set(k, String(v));
  },
  removeItem: (k) => { memory.delete(k); },
  clear: () => memory.clear(),
};
globalThis.__setFailNext = () => { failNext = true; };

const held = new Map();
globalThis.navigator = {
  locks: {
    request(name, cb) {
      const prev = held.get(name) || Promise.resolve();
      let release;
      const gate = new Promise((r) => { release = r; });
      held.set(name, prev.then(() => gate, () => gate));
      return prev.then(() => Promise.resolve(cb())).finally(release);
    },
  },
};

const idb = new Map();
export const get = async (k) => idb.get(k);
export const set = async (k, v) => { idb.set(k, v); };
export const del = async (k) => { idb.delete(k); };
`;

const testSource = `
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewApi } from '@/api/reviewApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const now = () => new Date().toISOString();
test('第二条评价写 reviews 成功但写 users 失败时整笔回滚', async () => {
  const users = [
    { id: 'u_a', nickname: 'A', avatar: '', phone: '1', location: '', credit_score: 50, created_at: now() },
    { id: 'u_b', nickname: 'B', avatar: '', phone: '2', location: '', credit_score: 50, created_at: now() },
  ];
  const exchange = {
    id: 'ex', from_user_id: 'u_a', to_user_id: 'u_b', from_item_id: 'i1', to_item_id: 'i2',
    status: 'completed', message: '', created_at: now(), updated_at: now(),
  };
  await storage.set(STORAGE_KEYS.users, users);
  await storage.set(STORAGE_KEYS.exchanges, [exchange]);
  await storage.set(STORAGE_KEYS.reviews, [
    { id: 'r1', exchange_id: 'ex', reviewer_id: 'u_a', reviewee_id: 'u_b', rating: 5, tags: ['守时赴约'], created_at: now(), credit_applied: false },
  ]);

  // 写入顺序为 reviews 然后 users；让“第二次写”（users）失败。
  let writes = 0;
  const orig = globalThis.localStorage.setItem.bind(globalThis.localStorage);
  globalThis.localStorage.setItem = (k, v) => {
    writes += 1;
    if (writes === 2) throw new Error('QuotaExceededError');
    return orig(k, v);
  };

  await assert.rejects(
    () => reviewApi.submit({ exchange_id: 'ex', reviewer_id: 'u_b', reviewee_id: 'u_a', rating: 1, tags: ['迟到'] }),
    /QuotaExceededError/,
  );

  globalThis.localStorage.setItem = orig;

  // 回滚后：reviews 仍是第一条（且未结算），users 信用分不变。
  const reviews = await storage.get(STORAGE_KEYS.reviews, []);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].credit_applied, false);
  const freshUsers = await storage.get(STORAGE_KEYS.users, []);
  assert.equal(freshUsers.find((u) => u.id === 'u_a').credit_score, 50);
  assert.equal(freshUsers.find((u) => u.id === 'u_b').credit_score, 50);
});
`;

async function main() {
  const mockPath = path.join(os.tmpdir(), 'reswap-idb-mock-atomic.js');
  const mockBuilt = await esbuild.transform(polyfill, { format: 'cjs', loader: 'ts' });
  fs.writeFileSync(mockPath, mockBuilt.code);

  const testPath = path.join(os.tmpdir(), 'reswap-atomic-test.ts');
  fs.writeFileSync(testPath, testSource);

  const result = await esbuild.build({
    entryPoints: [testPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    alias: {
      '@': path.join(__dirname, '..', 'src'),
      'idb-keyval': mockPath,
    },
  });
  const runFile = path.join(os.tmpdir(), 'reswap-atomic-test.cjs');
  fs.writeFileSync(runFile, result.outputFiles[0].text);
  require(runFile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
