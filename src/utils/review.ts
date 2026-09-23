import { CREDIT_SCORE_MAX, CREDIT_SCORE_MIN, REVIEW_CREDIT_DELTA } from '@/constants/review';

// 信用分只能落在 [0, 100]。
export const clampCreditScore = (score: number): number =>
  Math.min(CREDIT_SCORE_MAX, Math.max(CREDIT_SCORE_MIN, Math.round(score)));

// 星级对应的信用分增量（5:+3 4:+1 3:0 2:-1 1:-3）。
export const getCreditDelta = (rating: number): number => REVIEW_CREDIT_DELTA[rating] ?? 0;

// 应用一次评价带来的信用分变化，并做边界裁剪。
export const applyCreditDelta = (score: number, rating: number): number =>
  clampCreditScore(score + getCreditDelta(rating));
