// 互评相关枚举/常量：星级范围、星级对信用分的影响、可选标签。
// 与 ItemStatus / ExchangeStatus 一样集中定义，被 models、api、stores、
// components、formatters、validators 多处引用。

export enum ReviewRating {
  ONE = 1,
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
}

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

// 信用分边界：评分结算后 clamp 到 [0, 100]。
export const CREDIT_SCORE_MIN = 0;
export const CREDIT_SCORE_MAX = 100;

// 星级 -> 信用分增量：5 星 +3、4 星 +1、3 星不变、2 星 -1、1 星 -3。
export const REVIEW_CREDIT_DELTA: Record<number, number> = {
  [ReviewRating.FIVE]: 3,
  [ReviewRating.FOUR]: 1,
  [ReviewRating.THREE]: 0,
  [ReviewRating.TWO]: -1,
  [ReviewRating.ONE]: -3,
};

// 每个交换参与者最多只能评价一次。
export const REVIEW_LIMIT_PER_PARTICIPANT = 1;

// 互评可选标签（正面 / 负面）。
export const REVIEW_TAG_OPTIONS = [
  '守时赴约',
  '物品与描述一致',
  '沟通顺畅',
  '包装用心',
  '交换愉快',
  '迟到',
  '物品描述不符',
  '沟通困难',
  '临时变卦',
] as const;

// 评价存储 key 的耦合说明（与 item/exchange 的 STORAGE_HINTS 风格一致）。
export const REVIEW_STORAGE_HINTS = {
  statusKey: 'reswap:reviews',
  statusTouchedBy: [
    'models/review.ts',
    'api/reviewApi.ts',
    'stores/reviewStore.ts',
    'components/common/ExchangeReview.vue',
    'components/common/ExchangeCard.vue',
  ],
};
