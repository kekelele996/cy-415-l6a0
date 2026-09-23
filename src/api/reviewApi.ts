import { ExchangeStatus } from '@/constants/exchange';
import {
  clampCreditScore,
  REVIEW_MAX_RATING,
  REVIEW_MAX_TAGS,
  REVIEW_MIN_RATING,
  REVIEW_MIN_TAGS,
  REVIEW_RATING_CREDIT_DELTA,
  REVIEW_TAG_OPTIONS,
} from '@/constants/review';
import type { Exchange } from '@/models/exchange';
import type { ExchangeReview, ExchangeReviewDraft } from '@/models/review';
import type { User } from '@/models/user';

import { storage, STORAGE_KEYS } from '@/utils/storage';

/**
 * 每笔交换一把内存串行锁（promise chain）。
 * 同一 exchange 的提交无论来自双击、并发调用还是刷新后的重放，都会排队进入同一临界区；
 * 临界区内再次校验「本人是否已评价」，因此重复提交永远不会产生第二条写入。
 */
const inflight = new Map<string, Promise<unknown>>();

const serialize = <T>(exchangeId: string, task: () => Promise<T>): Promise<T> => {
  const previous = inflight.get(exchangeId) ?? Promise.resolve();
  const next = previous.then(task, task);
  inflight.set(
    exchangeId,
    next.finally(() => {
      if (inflight.get(exchangeId) === next) inflight.delete(exchangeId);
    }),
  );
  return next;
};

export const reviewApi = {
  async list(): Promise<ExchangeReview[]> {
    return storage.get<ExchangeReview[]>(STORAGE_KEYS.reviews, []);
  },

  /**
   * 提交本人对对方的评价。
   * 评价记录、双方公开状态、对方信用分在同一事务内提交，要么一起成功，要么全部不变。
   */
  async submitReview(
    exchange: Exchange,
    currentUserId: string,
    draft: ExchangeReviewDraft,
  ): Promise<ExchangeReview> {
    // 仅交换双方本人可提交，且对象固定为对方——交换不存在 / 非参与者直接拒绝
    if (exchange.from_user_id !== currentUserId && exchange.to_user_id !== currentUserId) {
      throw new Error('只有本次交换的参与者才能评价');
    }
    // 仅交换已完成时可提交
    if (exchange.status !== ExchangeStatus.COMPLETED) {
      throw new Error('交换完成后才能评价');
    }

    const rating = Number(draft.rating);
    if (!Number.isInteger(rating) || rating < REVIEW_MIN_RATING || rating > REVIEW_MAX_RATING) {
      throw new Error(`星级必须为 ${REVIEW_MIN_RATING} 至 ${REVIEW_MAX_RATING} 星`);
    }
    const tags = Array.from(new Set((draft.tags ?? []).map((tag) => tag?.trim()).filter(Boolean)));
    if (tags.length < REVIEW_MIN_TAGS || tags.length > REVIEW_MAX_TAGS) {
      throw new Error(`请选择 ${REVIEW_MIN_TAGS} 至 ${REVIEW_MAX_TAGS} 个评价标签`);
    }
    if (tags.some((tag) => !REVIEW_TAG_OPTIONS.includes(tag))) {
      throw new Error('评价标签不合法');
    }

    return serialize(exchange.id, async () => {
      // 临界区内重新读取最新数据，拦截并发 / 重放 / 刷新后的重复提交
      const [reviews, users] = await Promise.all([this.list(), storage.get<User[]>(STORAGE_KEYS.users, [])]);
      const already = reviews.find(
        (item) => item.exchange_id === exchange.id && item.reviewer_id === currentUserId,
      );
      if (already) {
        throw new Error('每笔交换只能评价一次，你已评价过本次交换');
      }

      // 对象固定为对方，由交换记录推导，忽略任何客户端传入
      const revieweeId =
        exchange.from_user_id === currentUserId ? exchange.to_user_id : exchange.from_user_id;
      const review: ExchangeReview = {
        id: storage.createId('review'),
        exchange_id: exchange.id,
        reviewer_id: currentUserId,
        reviewee_id: revieweeId,
        rating,
        tags,
        created_at: new Date().toISOString(),
      };

      // 信用分变更与评价写入在同一事务；公开状态由双方评价是否齐全推导（见 buildReviewPair）
      const nextUsers = users.map((user) =>
        user.id === revieweeId
          ? { ...user, credit_score: clampCreditScore(user.credit_score + REVIEW_RATING_CREDIT_DELTA[rating]) }
          : user,
      );

      await storage.commitAll([
        { key: STORAGE_KEYS.reviews, payload: [review, ...reviews] },
        { key: STORAGE_KEYS.users, payload: nextUsers },
      ]);

      return review;
    });
  },
};
