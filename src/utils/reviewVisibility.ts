import type { Exchange } from '@/models/exchange';
import type { ExchangeReview, ExchangeReviewPair } from '@/models/review';

/**
 * 汇总一笔交换的双方评价，并推导公开状态：
 * 双方都提交后 is_public = true，两条评价同时公开；
 * 只有一方提交时 is_public = false，未提交方看不到任何已提交内容。
 */
export const buildReviewPair = (exchange: Exchange, reviews: ExchangeReview[]): ExchangeReviewPair => {
  const pair: ExchangeReviewPair = { exchange_id: exchange.id, is_public: false };
  for (const review of reviews) {
    if (review.exchange_id !== exchange.id) continue;
    if (review.reviewer_id === exchange.from_user_id) pair.fromReview = review;
    else if (review.reviewer_id === exchange.to_user_id) pair.toReview = review;
  }
  pair.is_public = Boolean(pair.fromReview && pair.toReview);
  return pair;
};

/** 某用户是否已对该交换提交评价（本人始终可见自己的"已评价"状态） */
export const hasReviewed = (exchange: Exchange, reviews: ExchangeReview[], userId: string): boolean =>
  reviews.some((item) => item.exchange_id === exchange.id && item.reviewer_id === userId);

/**
 * 当前用户在该交换中可见的评价：
 * - 未公开（对方尚未提交）：本人可看到自己的评价内容，对方的评价不可见
 * - 已公开（双方都已提交）：两条评价均可见
 */
export const visibleReviewsFor = (
  exchange: Exchange,
  reviews: ExchangeReview[],
  currentUserId: string,
): ExchangeReview[] => {
  const pair = buildReviewPair(exchange, reviews);
  if (pair.is_public) return [pair.fromReview, pair.toReview].filter(Boolean) as ExchangeReview[];
  return reviews.filter(
    (item) => item.exchange_id === exchange.id && item.reviewer_id === currentUserId,
  );
};
