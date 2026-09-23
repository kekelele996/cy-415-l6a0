// 互评核心规则的 Node 验证脚本（不依赖浏览器）：
// 1. 仅参与者本人 + 交换已完成 + 对象固定为对方才可提交；
// 2. 每笔每人只写一次：重复提交 / 并发提交 / 重放都不多写；
// 3. 第一条隐藏（对方看不到），第二条到达时两条同时公开；
// 4. 信用分 5:+3 4:+1 3:0 2:-1 1:-3，clamp 到 [0,100]，
//    且评价、公开状态、信用分要么一起成功要么全部不变。
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ExchangeStatus } from '@/constants/exchange';
import { reviewApi } from '@/api/reviewApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';
import type { Exchange } from '@/models/exchange';
import type { User } from '@/models/user';

const nowIso = () => new Date().toISOString();

const makeUsers = (): User[] => [
  { id: 'u_a', nickname: 'A', avatar: '', phone: '1', location: '', credit_score: 50, created_at: nowIso() },
  { id: 'u_b', nickname: 'B', avatar: '', phone: '2', location: '', credit_score: 50, created_at: nowIso() },
  { id: 'u_edge_low', nickname: 'L', avatar: '', phone: '3', location: '', credit_score: 1, created_at: nowIso() },
  { id: 'u_edge_high', nickname: 'H', avatar: '', phone: '4', location: '', credit_score: 99, created_at: nowIso() },
];

const makeExchange = (
  id: string,
  from: string,
  to: string,
  status: ExchangeStatus = ExchangeStatus.COMPLETED,
): Exchange => ({
  id,
  from_user_id: from,
  to_user_id: to,
  from_item_id: 'i1',
  to_item_id: 'i2',
  status,
  message: '',
  created_at: nowIso(),
  updated_at: nowIso(),
});

const resetFixtures = async () => {
  await storage.set(STORAGE_KEYS.users, makeUsers());
  await storage.set(STORAGE_KEYS.exchanges, [
    makeExchange('ex_done', 'u_a', 'u_b'),
    makeExchange('ex_pending', 'u_a', 'u_b', ExchangeStatus.ACCEPTED),
    makeExchange('ex_low', 'u_edge_low', 'u_b'),
    makeExchange('ex_high', 'u_a', 'u_edge_high'),
  ]);
  await storage.set(STORAGE_KEYS.reviews, []);
};

const scoreOf = (users: User[], id: string) => users.find((u) => u.id === id)!.credit_score;

test('前置条件：未完成 / 非参与者 / 对象错误均被拒绝', async () => {
  await resetFixtures();

  await assert.rejects(
    () =>
      reviewApi.submit({
        exchange_id: 'ex_pending',
        reviewer_id: 'u_a',
        reviewee_id: 'u_b',
        rating: 5,
        tags: ['守时赴约'],
      }),
    /交换完成后才能评价/,
  );

  await assert.rejects(
    () =>
      reviewApi.submit({
        exchange_id: 'ex_done',
        reviewer_id: 'u_stranger',
        reviewee_id: 'u_b',
        rating: 5,
        tags: ['守时赴约'],
      }),
    /只有交换参与者本人可评价/,
  );

  await assert.rejects(
    () =>
      reviewApi.submit({
        exchange_id: 'ex_done',
        reviewer_id: 'u_a',
        reviewee_id: 'u_stranger',
        rating: 5,
        tags: ['守时赴约'],
      }),
    /评价对象必须是该笔交换的对方/,
  );

  // 全部拒绝后，没有任何评价被写入，信用分不变。
  const reviews = await storage.get(STORAGE_KEYS.reviews, []);
  const users = await storage.get(STORAGE_KEYS.users, makeUsers());
  assert.equal(reviews.length, 0);
  assert.equal(scoreOf(users, 'u_a'), 50);
  assert.equal(scoreOf(users, 'u_b'), 50);
});

test('第一条评价提交后隐藏：本人已评价，对方看不到，信用分不变', async () => {
  await resetFixtures();

  const result = await reviewApi.submit({
    exchange_id: 'ex_done',
    reviewer_id: 'u_a',
    reviewee_id: 'u_b',
    rating: 5,
    tags: ['守时赴约'],
  });
  assert.equal(result.revealed, false);
  assert.equal(result.review.credit_applied, false);
  assert.equal(result.reviews.length, 1);

  const users = await storage.get(STORAGE_KEYS.users, makeUsers());
  assert.equal(scoreOf(users, 'u_b'), 50, '未公开前信用分不应变化');
});

test('第二条到达：两条同时公开，并按星级结算双方信用分', async () => {
  await resetFixtures();

  // A 给 B 打 5 星（B 应 +3）
  await reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_a', reviewee_id: 'u_b', rating: 5, tags: ['守时赴约'] });
  // B 给 A 打 1 星（A 应 -3）
  const second = await reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_b', reviewee_id: 'u_a', rating: 1, tags: ['迟到'] });

  assert.equal(second.revealed, true);
  assert.equal(second.reviews.length, 2);
  assert.ok(second.reviews.every((r) => r.credit_applied));

  const users = second.users;
  assert.equal(scoreOf(users, 'u_b'), 53);
  assert.equal(scoreOf(users, 'u_a'), 47);

  // 落盘后的 reviews 也都标记已结算
  const persisted = await storage.get(STORAGE_KEYS.reviews, []);
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every((r) => r.credit_applied));
});

test('重复提交被拒绝且不再改变信用分（刷新重放）', async () => {
  await resetFixtures();

  await reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_a', reviewee_id: 'u_b', rating: 5, tags: ['守时赴约'] });
  await reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_b', reviewee_id: 'u_a', rating: 2, tags: ['迟到'] });

  // 此时 B=53(+3), A=49(-1)。再次重放任意一方：
  await assert.rejects(
    () => reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_a', reviewee_id: 'u_b', rating: 1, tags: ['迟到'] }),
    /已经评价过/,
  );
  await assert.rejects(
    () => reviewApi.submit({ exchange_id: 'ex_done', reviewer_id: 'u_b', reviewee_id: 'u_a', rating: 1, tags: ['迟到'] }),
    /已经评价过/,
  );

  const users = await storage.get(STORAGE_KEYS.users, makeUsers());
  assert.equal(scoreOf(users, 'u_b'), 53);
  assert.equal(scoreOf(users, 'u_a'), 49);
  const reviews = await storage.get(STORAGE_KEYS.reviews, []);
  assert.equal(reviews.length, 2);
});

test('并发提交：同一方连点两次只成功一次，双方同时提交时恰好两条', async () => {
  await resetFixtures();

  // A 连点两次（参数相同）：一个成功一个被拒绝，最终只有 1 条。
  const draftA = { exchange_id: 'ex_done', reviewer_id: 'u_a', reviewee_id: 'u_b', rating: 4, tags: ['沟通顺畅'] };
  const results = await Promise.allSettled([reviewApi.submit(draftA), reviewApi.submit({ ...draftA, tags: [...draftA.tags] })]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);

  const afterA = await storage.get(STORAGE_KEYS.reviews, []);
  assert.equal(afterA.length, 1);

  // A、B 几乎同时提交第二条场景（B 首次 + A 重放同时发生）
  const draftB = { exchange_id: 'ex_done', reviewer_id: 'u_b', reviewee_id: 'u_a', rating: 5, tags: ['交换愉快'] };
  const race = await Promise.allSettled([
    reviewApi.submit(draftB),
    reviewApi.submit({ ...draftA, tags: [...draftA.tags] }), // A 的重放
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.filter((r) => r.status === 'rejected').length, 1);

  const finalReviews = await storage.get(STORAGE_KEYS.reviews, []);
  assert.equal(finalReviews.length, 2, '并发下仍然恰好两条评价');
  const users = await storage.get(STORAGE_KEYS.users, makeUsers());
  // B 收到 A 的 4 星 +1；A 收到 B 的 5 星 +3
  assert.equal(scoreOf(users, 'u_b'), 51);
  assert.equal(scoreOf(users, 'u_a'), 53);
});

test('信用分边界：+3 不超过 100，-3 不低于 0', async () => {
  await resetFixtures();

  // u_edge_high=99 收 5 星 +3 -> 100
  await reviewApi.submit({ exchange_id: 'ex_high', reviewer_id: 'u_a', reviewee_id: 'u_edge_high', rating: 5, tags: ['交换愉快'] });
  await reviewApi.submit({ exchange_id: 'ex_high', reviewer_id: 'u_edge_high', reviewee_id: 'u_a', rating: 3, tags: ['沟通顺畅'] });
  let users = await storage.get(STORAGE_KEYS.users, makeUsers());
  assert.equal(scoreOf(users, 'u_edge_high'), 100);
  assert.equal(scoreOf(users, 'u_a'), 50, '3 星信用分不变');

  // u_edge_low=1 收 1 星 -3 -> 0
  await resetFixtures();
  await reviewApi.submit({ exchange_id: 'ex_low', reviewer_id: 'u_edge_low', reviewee_id: 'u_b', rating: 5, tags: ['交换愉快'] });
  await reviewApi.submit({ exchange_id: 'ex_low', reviewer_id: 'u_b', reviewee_id: 'u_edge_low', rating: 1, tags: ['迟到'] });
  users = await storage.get(STORAGE_KEYS.users, makeUsers());
  assert.equal(scoreOf(users, 'u_edge_low'), 0);
});

test('表单形状校验：星级范围与标签必填', () => {
  assert.throws(() => reviewApi.assertDraftShape({ exchange_id: 'x', reviewer_id: 'a', reviewee_id: 'b', rating: 6, tags: ['t'] }), /星级/);
  assert.throws(() => reviewApi.assertDraftShape({ exchange_id: 'x', reviewer_id: 'a', reviewee_id: 'b', rating: 0, tags: ['t'] }), /星级/);
  assert.throws(() => reviewApi.assertDraftShape({ exchange_id: 'x', reviewer_id: 'a', reviewee_id: 'b', rating: 5, tags: [] }), /标签/);
  assert.throws(() => reviewApi.assertDraftShape({ exchange_id: 'x', reviewer_id: 'a', reviewee_id: 'b', rating: 5, tags: ['不存在的标签'] }), /标签/);
});
