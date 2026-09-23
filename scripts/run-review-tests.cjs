// 用 esbuild 把 TS 测试连同“内存版浏览器环境”一起打包，再用 node:test 运行。
// 纯前端项目没有后端，这里直接验证 storage 事务 + reviewApi 的业务规则。
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { createRequire } = require('node:module');
const esbuildPkg = path.join(__dirname, '..', 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild');
const esbuild = createRequire(path.join(esbuildPkg, 'x.js'))(esbuildPkg);

const polyfill = `
import { test as nodeTest } from 'node:test';

// ---- 内存版 localStorage ----
const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => { memory.set(k, String(v)); },
  removeItem: (k) => { memory.delete(k); },
  clear: () => memory.clear(),
};

// ---- 内存版 Web Locks（语义与浏览器一致：同名互斥、跨“标签页”排队）----
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

// ---- 内存版 idb-keyval ----
const idb = new Map();
globalThis.__idbMock = {
  get: async (k) => (idb.has(k) ? idb.get(k) : undefined),
  set: async (k, v) => { idb.set(k, v); },
  del: async (k) => { idb.delete(k); },
  __dump: () => new Map(idb),
};

export const get = async (k) => globalThis.__idbMock.get(k);
export const set = async (k, v) => globalThis.__idbMock.set(k, v);
export const del = async (k) => globalThis.__idbMock.del(k);
`;

async function main() {
  const mockPath = path.join(os.tmpdir(), 'reswap-idb-mock.js');
  // 把 polyfill 转成 CJS 写入 mock 路径（esbuild 再打包它）。
  const mockBuilt = await esbuild.transform(polyfill, { format: 'cjs', loader: 'ts' });
  fs.writeFileSync(mockPath, mockBuilt.code);

  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'review.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    alias: {
      '@': path.join(__dirname, '..', 'src'),
      'idb-keyval': mockPath,
    },
  });

  const code = result.outputFiles[0].text;
  const runFile = path.join(os.tmpdir(), 'reswap-review-test.cjs');
  fs.writeFileSync(runFile, code);
  require(runFile);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
