import type { ItemDraft } from '@/models/item';
import type { ReviewDraft } from '@/models/review';
import type { UserDraft } from '@/models/user';

import { REVIEW_RATING_MAX, REVIEW_RATING_MIN } from '@/constants/review';
import { FORM_MESSAGES, REVIEW_MESSAGES } from '@/constants/messages';

export const validateItemDraft = (draft: Partial<ItemDraft>) => {
  if (!draft.title?.trim()) return FORM_MESSAGES.requiredTitle;
  if (!draft.description?.trim()) return FORM_MESSAGES.requiredDescription;
  return '';
};

export const validateUserDraft = (draft: Partial<UserDraft>) => {
  if (!draft.nickname?.trim()) return '昵称不能为空';
  if (!draft.phone?.trim()) return FORM_MESSAGES.requiredPhone;
  return '';
};

// 评价表单级校验：星级必填且在 1~5，标签至少一个。
// 提交权限（本人/已完成/对象为对方/不可重复）在 reviewApi 事务内再做权威校验。
export const validateReviewDraft = (draft: Pick<ReviewDraft, 'rating' | 'tags'>) => {
  if (!Number.isInteger(draft.rating) || draft.rating < REVIEW_RATING_MIN || draft.rating > REVIEW_RATING_MAX) {
    return REVIEW_MESSAGES.ratingRequired;
  }
  if (!draft.tags.length) return REVIEW_MESSAGES.tagRequired;
  return '';
};
