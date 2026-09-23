import type { ItemDraft } from '@/models/item';
import type { ExchangeReviewDraft } from '@/models/review';
import type { UserDraft } from '@/models/user';

import { FORM_MESSAGES, REVIEW_MESSAGES } from '@/constants/messages';
import { REVIEW_MAX_RATING, REVIEW_MAX_TAGS, REVIEW_MIN_RATING, REVIEW_MIN_TAGS } from '@/constants/review';

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

export const validateReviewDraft = (draft: ExchangeReviewDraft) => {
  if (!Number.isInteger(draft.rating) || draft.rating < REVIEW_MIN_RATING || draft.rating > REVIEW_MAX_RATING) {
    return REVIEW_MESSAGES.ratingRequired;
  }
  const tags = (draft.tags ?? []).filter(Boolean);
  if (tags.length < REVIEW_MIN_TAGS) return REVIEW_MESSAGES.tagsRequired;
  if (tags.length > REVIEW_MAX_TAGS) return REVIEW_MESSAGES.tagsLimit;
  return '';
};
