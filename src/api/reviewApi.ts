import { REVIEW_RATING_MAX, REVIEW_RATING_MIN, REVIEW_TAG_OPTIONS } from '@/constants/review';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange } from '@/models/exchange';
import type { Review, ReviewDraft } from '@/models/review';
import type { User } from '@/models/user';
import { applyCreditDelta } from '@/utils/review';

import { storage, STORAGE_KEYS } from '@/utils/storage';

// 演示数据：一笔已完成且双方都已评价（公开可见）的交换。
const seedReviews: Review[] = [
  {
    id: 'review_seed_lin',
    exchange_id: 'exchange_seed_rated',
    reviewer_id: 'user_lin',
    reviewee_id: 'user_chen',
    rating: 4,
    tags: ['守时赴约', '沟通顺畅'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    credit_applied: true,
  },
  {
    id: 'review_seed_chen',
    exchange_id: 'exchange_seed_rated',
    reviewer_id: 'user_chen',
    reviewee_id: 'user_lin',
    rating: 5,
    tags: ['物品与描述一致', '交换愉快'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 19).toISOString(),
    credit_applied: true,
  },
];

export interface SubmitReviewResult {
  review: Review;
  reviews: Review[];
  users: User[];
  // true 表示这是该交换的第二条评价：本次提交把两条评价一起公开并结算信用分。
  revealed: boolean;
}

const isExchangeParticipant = (exchange: Exchange, userId: string) =>
  exchange.from_user_id === userId || exchange.to_user_id === userId;

const counterpartOf = (exchange: Exchange, userId: string) =>
  exchange.from_user_id === userId ? exchange.to_user_id : exchange.from_user_id;

export const reviewApi = {
  async list(): Promise<Review[]> {
    const reviews = await storage.get<Review[]>(STORAGE_KEYS.reviews, []);
    if (reviews.length) return reviews;
    await storage.set(STORAGE_KEYS.reviews, seedReviews);
    return seedReviews.map((item) => ({ ...item, tags: [...item.tags] }));
  },

  listByExchange(reviews: Review[], exchangeId: string): Review[] {
    return reviews.filter((review) => review.exchange_id === exchangeId);
  },

  // 提交互评。所有判断都在 storage.transaction 的锁内基于最新数据完成：
  // 重复、并发（同页多次点击 / 多标签页同时提交）、刷新重放都不会多写一条，
  // 评价、公开状态、信用分三者要么一起成功，要么全部保持不变。
  async submit(draft: ReviewDraft): Promise<SubmitReviewResult> {
    this.assertDraftShape(draft);

    return storage.transaction(
      STORAGE_KEYS.reviews,
      [STORAGE_KEYS.exchanges, STORAGE_KEYS.reviews, STORAGE_KEYS.users],
      async (read) => {
        const exchanges = ((await read(STORAGE_KEYS.exchanges)) as Exchange[] | null) ?? [];
        const reviews = ((await read(STORAGE_KEYS.reviews)) as Review[] | null) ?? [];
        const users = ((await read(STORAGE_KEYS.users)) as User[] | null) ?? [];

        const exchange = exchanges.find((item) => item.id === draft.exchange_id);
        if (!exchange) throw new Error('交换记录不存在');
        if (exchange.status !== ExchangeStatus.COMPLETED) throw new Error('交换完成后才能评价');
        if (!isExchangeParticipant(exchange, draft.reviewer_id)) throw new Error('只有交换参与者本人可评价');
        if (draft.reviewee_id !== counterpartOf(exchange, draft.reviewer_id)) {
          throw new Error('评价对象必须是该笔交换的对方');
        }

        // 幂等闸门：同一参与者对同一交换只允许成功一次。
        // 并发提交时后到的请求在锁内读到的仍是最新列表，同样会被挡住。
        const existed = reviews.some(
          (review) => review.exchange_id === draft.exchange_id && review.reviewer_id === draft.reviewer_id,
        );
        if (existed) throw new Error('这笔交换你已经评价过，不能重复评价');

        const existingForExchange = this.listByExchange(reviews, draft.exchange_id);
        const now = new Date().toISOString();
        const review: Review = {
          ...draft,
          tags: [...new Set(draft.tags)],
          id: storage.createId('review'),
          created_at: now,
          // 第一条评价先隐藏、不结算；第二条到达时才统一置 true。
          credit_applied: false,
        };

        const nextReviews = [...reviews, review];

        // 第二条评价到达：两条评价同时公开，并一次性结算双方信用分。
        const revealed = existingForExchange.length === 1;
        // users 来自快照的深拷贝，可直接修改；reviews 同理，已结算标记落在 nextReviews 上。
        const nextUsers = users;
        if (revealed) {
          const bothIds = new Set([...existingForExchange.map((entry) => entry.id), review.id]);
          for (const stored of nextReviews) {
            if (!bothIds.has(stored.id) || stored.credit_applied) continue;
            const target = nextUsers.find((user) => user.id === stored.reviewee_id);
            if (!target) throw new Error('被评价用户不存在');
            target.credit_score = applyCreditDelta(target.credit_score, stored.rating);
            stored.credit_applied = true;
          }
        }

        return {
          result: { review, reviews: nextReviews, users: nextUsers, revealed },
          writes: {
            [STORAGE_KEYS.reviews]: nextReviews,
            [STORAGE_KEYS.users]: nextUsers,
          },
        };
      },
    );
  },

  // 入参形状校验：星级必须是 1~5 的整数，标签必须来自预设且至少一个。
  assertDraftShape(draft: ReviewDraft): void {
    if (!Number.isInteger(draft.rating) || draft.rating < REVIEW_RATING_MIN || draft.rating > REVIEW_RATING_MAX) {
      throw new Error(`星级必须是 ${REVIEW_RATING_MIN}~${REVIEW_RATING_MAX} 的整数`);
    }
    if (!Array.isArray(draft.tags) || draft.tags.length === 0) {
      throw new Error('请至少选择一个评价标签');
    }
    const allowed = REVIEW_TAG_OPTIONS as readonly string[];
    if (draft.tags.some((tag) => !allowed.includes(tag) || !tag.trim())) {
      throw new Error('评价标签不合法');
    }
  },
};
