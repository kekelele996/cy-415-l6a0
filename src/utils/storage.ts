import { del, get, set } from 'idb-keyval';

import { runWithLock } from './lock';
import type { PersistedEnvelope } from '@/types';

const STORAGE_VERSION = 1;
const DEFAULT_TTL = 1000 * 60 * 60 * 24 * 365;

const prefixed = (key: string) => `reswap:${key}`;

export const STORAGE_KEYS = {
  currentUserId: prefixed('current-user-id'),
  users: prefixed('users'),
  items: prefixed('items'),
  exchanges: prefixed('exchanges'),
  reviews: prefixed('reviews'),
  theme: prefixed('theme'),
  lastClean: prefixed('last-clean'),
};

const now = () => Date.now();

const envelope = <T>(payload: T, ttl = DEFAULT_TTL): PersistedEnvelope<T> => ({
  version: STORAGE_VERSION,
  expiresAt: now() + ttl,
  payload,
});

const toPlain = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

const isExpired = <T>(data: PersistedEnvelope<T> | null) => {
  if (!data) return false;
  return Boolean(data.expiresAt && data.expiresAt < now());
};

const parseLocal = <T>(key: string): PersistedEnvelope<T> | null => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedEnvelope<T>;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
};

const writeLocal = <T>(key: string, payload: T, ttl?: number) => {
  localStorage.setItem(key, JSON.stringify(envelope(payload, ttl)));
};

export const storage = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const localEnvelope = parseLocal<T>(key);
    if (isExpired(localEnvelope)) {
      await this.remove(key);
      return fallback;
    }
    if (localEnvelope?.version === STORAGE_VERSION) {
      return localEnvelope.payload;
    }

    const indexedEnvelope = await get<PersistedEnvelope<T>>(key);
    if (isExpired(indexedEnvelope ?? null)) {
      await this.remove(key);
      return fallback;
    }
    if (indexedEnvelope?.version === STORAGE_VERSION) {
      writeLocal(key, indexedEnvelope.payload);
      return indexedEnvelope.payload;
    }
    return fallback;
  },

  async set<T>(key: string, payload: T, ttl?: number): Promise<T> {
    const plainPayload = toPlain(payload);
    const packed = envelope(plainPayload, ttl);
    localStorage.setItem(key, JSON.stringify(packed));
    await set(key, packed);
    return plainPayload;
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    await del(key);
  },

  // 在跨标签页锁内对多个 key 执行读-改-写。
  // 任务体内只能通过返回的 reader 读取数据，并返回每个 key 的最终值。
  // reader 一律返回快照的深拷贝，任务体内的任何修改都不会污染回滚基线；
  // 任一步失败或没有拿到全部结果，则恢复所有快照，保证多 key “要么一起成功，要么全部不变”。
  async transaction<TKeys extends string, TResult>(
    lockKey: string,
    keys: readonly TKeys[],
    task: (reader: (key: TKeys) => Promise<unknown>) => Promise<{ result: TResult; writes: Partial<Record<TKeys, unknown>> }>,
  ): Promise<TResult> {
    return runWithLock(lockKey, async () => {
      const snapshots = new Map<TKeys, unknown>();
      for (const key of keys) {
        snapshots.set(key, await this.get<unknown>(key, null));
      }

      const reader = async (key: TKeys): Promise<unknown> => toPlain(snapshots.get(key) ?? null);

      let outcome: { result: TResult; writes: Partial<Record<TKeys, unknown>> };
      try {
        outcome = await task(reader);
      } catch (error) {
        await this.restoreSnapshots(keys, snapshots);
        throw error;
      }

      // 先写 localStorage：任一 key 抛异常（如配额不足）都立即回滚，不动 IndexedDB。
      try {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(outcome.writes, key)) {
            writeLocal(key, outcome.writes[key]);
          }
        }
      } catch (error) {
        await this.restoreSnapshots(keys, snapshots);
        throw error;
      }

      // 再写 IndexedDB：逐个写入，失败则整笔回滚（localStorage 与 IndexedDB 都恢复快照）。
      try {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(outcome.writes, key)) {
            await set(key, envelope(outcome.writes[key]));
          }
        }
      } catch (error) {
        await this.restoreSnapshots(keys, snapshots);
        throw error;
      }

      return outcome.result;
    });
  },

  async restoreSnapshots<TKeys extends string>(keys: readonly TKeys[], snapshots: Map<TKeys, unknown>): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        const snapshot = snapshots.get(key);
        if (snapshot === null || snapshot === undefined) {
          await this.remove(key);
          return;
        }
        try {
          localStorage.setItem(key, JSON.stringify(envelope(snapshot)));
        } catch {
          // localStorage 回写失败时仍尽力恢复 IndexedDB。
        }
        await set(key, envelope(snapshot));
      }),
    );
  },

  async cleanExpired(): Promise<void> {
    const keys = Object.values(STORAGE_KEYS);
    await Promise.all(
      keys.map(async (key) => {
        const localEnvelope = parseLocal<unknown>(key);
        if (isExpired(localEnvelope)) {
          await this.remove(key);
        }
      }),
    );
    localStorage.setItem(STORAGE_KEYS.lastClean, JSON.stringify(envelope(new Date().toISOString())));
  },

  createId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  },
};
