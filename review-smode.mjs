import { createServer } from 'vite';
import path from 'node:path';

// ---- localStorage shim ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

// ---- Minimal IndexedDB shim implementing the surface idb-keyval/idb uses ----
const idbData = {};
function makeRequest(result) {
  const listeners = { success: [], error: [] };
  const req = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
    addEventListener(type, handler) {
      listeners[type]?.push(handler);
    },
    removeEventListener() {},
    _fire(type) {
      const event = { target: req, currentTarget: req };
      req.onsuccess?.(event);
      listeners[type]?.forEach((h) => h(event));
    },
  };
  return req;
}
const resolveRequest = (req, value) =>
  queueMicrotask(() => {
    req.result = value;
    req._fire('success');
  });
class FakeObjectStore {
  constructor(name, dbName, transaction) {
    this.name = name;
    this.dbName = dbName;
    this.transaction = transaction;
    this._map = () => (idbData[dbName] ??= {})[name] ??= new Map();
  }
  get(key) {
    const req = makeRequest(undefined);
    resolveRequest(req, this._map().get(key));
    return req;
  }
  put(value, key) {
    this._map().set(key, value);
    const req = makeRequest(key);
    resolveRequest(req, key);
    return req;
  }
  delete(key) {
    this._map().delete(key);
    const req = makeRequest(undefined);
    resolveRequest(req, undefined);
    return req;
  }
  createIndex() {
    return {};
  }
}
class FakeTransaction {
  constructor(storeName, dbName, mode) {
    this.mode = mode;
    this.storeName = storeName;
    this.dbName = dbName;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this._done = new Promise((resolve) => {
      this._resolveDone = resolve;
    });
    this.done = this._done;
    this.store = new FakeObjectStore(storeName, dbName, this);
    queueMicrotask(() => {
      this.oncomplete?.({ target: this });
      this._resolveDone();
    });
  }
  objectStore(name) {
    return name === this.storeName ? this.store : new FakeObjectStore(name, this.dbName, this);
  }
  abort() {}
}
class FakeDB {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.objectStoreNames = { contains: () => true };
    this.onversionchange = null;
    this.onclose = null;
  }
  close() {}
  createObjectStore(name) {
    (idbData[this.name] ??= {})[name] ??= new Map();
    return new FakeObjectStore(name, this.name, null);
  }
  transaction(storeNames, mode) {
    const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    return new FakeTransaction(name, this.name, mode);
  }
}
globalThis.indexedDB = {
  open(dbName) {
    const req = makeRequest(null);
    req.onupgradeneeded = null;
    req.onblocked = null;
    const db = new FakeDB(dbName, 1);
    req.result = db;
    queueMicrotask(() => {
      // first connection acts as an upgrade: idb-keyval's handler calls createObjectStore
      if (!idbData[dbName]) req.onupgradeneeded?.({ target: req });
      req._fire('success');
    });
    return req;
  },
  deleteDatabase() {
    return makeRequest(undefined);
  },
};

const root = process.cwd();
const server = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  resolve: { alias: { '@': path.join(root, 'src') } },
  optimizeDeps: { noDiscovery: true, include: [] },
});
server.ssrLoadModule; // ensure
await server.listen();

const { storage, STORAGE_KEYS } = await server.ssrLoadModule('/src/utils/storage.ts');
const { ExchangeStatus } = await server.ssrLoadModule('/src/constants/exchange.ts');
const { reviewApi } = await server.ssrLoadModule('/src/api/reviewApi.ts');
const { buildReviewPair, visibleReviewsFor } = await server.ssrLoadModule('/src/utils/reviewVisibility.ts');

let pass = 0,
  fail = 0;
const ok = (name, cond) => {
  cond ? (pass++, console.log('PASS', name)) : (fail++, console.log('FAIL', name));
};

await storage.set(STORAGE_KEYS.users, [
  { id: 'me', credit_score: 92 },
  { id: 'lin', credit_score: 100 },
  { id: 'chen', credit_score: 0 },
]);

const completed = { id: 'ex1', from_user_id: 'me', to_user_id: 'lin', status: ExchangeStatus.COMPLETED };
const pending = { id: 'ex2', from_user_id: 'me', to_user_id: 'lin', status: ExchangeStatus.PENDING };
const outsider = { id: 'ex3', from_user_id: 'a', to_user_id: 'b', status: ExchangeStatus.COMPLETED };

let threw = false;
try {
  await reviewApi.submitReview(outsider, 'me', { rating: 5, tags: ['沟通顺畅'] });
} catch {
  threw = true;
}
ok('非参与者不能评价', threw);

threw = false;
try {
  await reviewApi.submitReview(pending, 'me', { rating: 5, tags: ['沟通顺畅'] });
} catch {
  threw = true;
}
ok('未完成不能评价', threw);

threw = false;
try {
  await reviewApi.submitReview(completed, 'me', { rating: 6, tags: ['沟通顺畅'] });
} catch {
  threw = true;
}
ok('星级越界拒绝', threw);
threw = false;
try {
  await reviewApi.submitReview(completed, 'me', { rating: 5, tags: [] });
} catch {
  threw = true;
}
ok('缺少标签拒绝', threw);

await reviewApi.submitReview(completed, 'me', { rating: 5, tags: ['沟通顺畅', '守时守约'] });
let users = await storage.get(STORAGE_KEYS.users, []);
ok('信用分封顶100 (100+3->100)', users.find((u) => u.id === 'lin').credit_score === 100);
let reviews = await reviewApi.list();
ok('写入一条评价', reviews.length === 1);
let pair = buildReviewPair(completed, reviews);
ok('仅一方提交时未公开', pair.is_public === false);

ok('对方在公开前看不到内容', visibleReviewsFor(completed, reviews, 'lin').length === 0);
ok('本人公开前可看自己的', visibleReviewsFor(completed, reviews, 'me').length === 1);

threw = false;
try {
  await reviewApi.submitReview(completed, 'me', { rating: 1, tags: ['沟通失联'] });
} catch {
  threw = true;
}
ok('重复提交被拒绝', threw);
reviews = await reviewApi.list();
ok('重复提交不多写', reviews.length === 1);

const completed2 = { id: 'ex4', from_user_id: 'me', to_user_id: 'chen', status: ExchangeStatus.COMPLETED };
const results = await Promise.allSettled([
  reviewApi.submitReview(completed2, 'me', { rating: 5, tags: ['沟通顺畅'] }),
  reviewApi.submitReview(completed2, 'me', { rating: 5, tags: ['沟通顺畅'] }),
]);
const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
reviews = await reviewApi.list();
const ex4 = reviews.filter((r) => r.exchange_id === 'ex4');
ok('并发同用户仅一条成功', fulfilled === 1 && ex4.length === 1);
users = await storage.get(STORAGE_KEYS.users, []);
ok('并发信用分只加一次 (0+3=3)', users.find((u) => u.id === 'chen').credit_score === 3);

await reviewApi.submitReview(completed, 'lin', { rating: 1, tags: ['沟通失联'] });
users = await storage.get(STORAGE_KEYS.users, []);
ok('1星减3 (92->89)', users.find((u) => u.id === 'me').credit_score === 89);
reviews = await reviewApi.list();
pair = buildReviewPair(completed, reviews);
ok('双方提交后同时公开', Boolean(pair.is_public && pair.fromReview && pair.toReview));
ok('公开后双方可见两条', visibleReviewsFor(completed, reviews, 'lin').length === 2);

threw = false;
try {
  await reviewApi.submitReview(completed, 'lin', { rating: 4, tags: ['包装用心'] });
} catch {
  threw = true;
}
ok('公开后仍不可重复评价', threw);

const ex5 = { id: 'ex5', from_user_id: 'lin', to_user_id: 'chen', status: ExchangeStatus.COMPLETED };
await reviewApi.submitReview(ex5, 'lin', { rating: 1, tags: ['迟到爽约'] });
users = await storage.get(STORAGE_KEYS.users, []);
ok('信用分封底0 (0-3->0)', users.find((u) => u.id === 'chen').credit_score === 0);

const ex6 = { id: 'ex6', from_user_id: 'me', to_user_id: 'lin', status: ExchangeStatus.COMPLETED };
await reviewApi.submitReview(ex6, 'me', { rating: 4, tags: ['包装用心'] });
await reviewApi.submitReview(ex6, 'lin', { rating: 3, tags: ['交换愉快'] });
users = await storage.get(STORAGE_KEYS.users, []);
ok(
  '4星给lin(封顶100) & 3星me不变(89)',
  users.find((u) => u.id === 'lin').credit_score === 100 && users.find((u) => u.id === 'me').credit_score === 89,
);

// rollback: force reviews key write to throw -> users must be unchanged
const beforeUsers = JSON.stringify(await storage.get(STORAGE_KEYS.users, []));
const origSetItem = globalThis.localStorage.setItem;
let thrownOnce = false;
globalThis.localStorage.setItem = (k, v) => {
  if (k === STORAGE_KEYS.reviews && !thrownOnce) {
    thrownOnce = true;
    throw new DOMException('quota exceeded', 'QuotaExceededError');
  }
  return origSetItem.call(globalThis.localStorage, k, v);
};
const ex7 = { id: 'ex7', from_user_id: 'me', to_user_id: 'chen', status: ExchangeStatus.COMPLETED };
let rollbackThrew = false;
try {
  await reviewApi.submitReview(ex7, 'me', { rating: 5, tags: ['沟通顺畅'] });
} catch {
  rollbackThrew = true;
}
globalThis.localStorage.setItem = origSetItem;
const afterUsers = JSON.stringify(await storage.get(STORAGE_KEYS.users, []));
const reviewsAfter = await reviewApi.list();
ok('原子失败时整体回滚(抛出)', rollbackThrew);
ok('原子失败时信用分不变', beforeUsers === afterUsers);
ok('原子失败时评价未写入', reviewsAfter.every((r) => r.exchange_id !== 'ex7'));

console.log(`\n${pass} passed, ${fail} failed`);
await server.close();

// reverse ordering: commitAll writes reviews first then users; force USERS write to fail.
// commitAll internally iterates changes order [reviews, users]; simulate users failure.
const revBefore = (await reviewApi.list()).length;
const uBefore = JSON.stringify(await storage.get(STORAGE_KEYS.users, []));
const oSet = globalThis.localStorage.setItem;
let once=false;
globalThis.localStorage.setItem=(k,v)=>{ if(k===STORAGE_KEYS.users && !once){once=true; throw new DOMException('x','QuotaExceededError');} return oSet.call(globalThis.localStorage,k,v); };
let rt=false;
const ex8={id:'ex8',from_user_id:'me',to_user_id:'chen',status:ExchangeStatus.COMPLETED};
try{ await reviewApi.submitReview(ex8,'me',{rating:2,tags:['描述不符']}); }catch{ rt=true; }
globalThis.localStorage.setItem=oSet;
ok('第二键失败也回滚(抛出)', rt);
ok('第二键失败后reviews条数不变', (await reviewApi.list()).length===revBefore);
ok('第二键失败后users回滚', JSON.stringify(await storage.get(STORAGE_KEYS.users, []))===uBefore);
console.log('\n'+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);

