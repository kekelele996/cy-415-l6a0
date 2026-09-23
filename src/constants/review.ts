/**
 * 互评相关常量。
 * 被 models/review.ts、api/reviewApi.ts、stores/reviewStore.ts、
 * components/common/ReviewDialog.vue、utils/formatters.ts、utils/validators.ts 多处引用。
 */

export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 5;

export const REVIEW_MIN_TAGS = 1;
export const REVIEW_MAX_TAGS = 3;

/** 星级对被评价人信用分的影响：5★+3 / 4★+1 / 3★0 / 2★-1 / 1★-3 */
export const REVIEW_RATING_CREDIT_DELTA: Record<number, number> = {
  1: -3,
  2: -1,
  3: 0,
  4: 1,
  5: 3,
};

export const CREDIT_SCORE_MIN = 0;
export const CREDIT_SCORE_MAX = 100;

/** 好评（4、5 星）可选标签 */
export const REVIEW_POSITIVE_TAGS = ['沟通顺畅', '物品如实描述', '守时守约', '包装用心', '交换愉快'];

/** 差评（1、2 星）可选标签 */
export const REVIEW_NEGATIVE_TAGS = ['沟通失联', '描述不符', '迟到爽约', '物品有损伤'];

/** 中评（3 星）可从两侧任选 */
export const REVIEW_TAG_OPTIONS = [...REVIEW_POSITIVE_TAGS, ...REVIEW_NEGATIVE_TAGS];

export const REVIEW_TAG_TONE: Record<string, 'positive' | 'negative'> = Object.fromEntries(
  REVIEW_POSITIVE_TAGS.map((tag) => [tag, 'positive' as const]).concat(
    REVIEW_NEGATIVE_TAGS.map((tag) => [tag, 'negative' as const]),
  ),
);

/** 按星级给出可选标签范围 */
export const reviewTagOptionsForRating = (rating: number): string[] => {
  if (rating >= 4) return REVIEW_POSITIVE_TAGS;
  if (rating <= 2) return REVIEW_NEGATIVE_TAGS;
  return REVIEW_TAG_OPTIONS;
};

export const clampCreditScore = (score: number): number =>
  Math.min(CREDIT_SCORE_MAX, Math.max(CREDIT_SCORE_MIN, Math.round(score)));
