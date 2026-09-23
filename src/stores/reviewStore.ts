import { defineStore } from 'pinia';

import { reviewApi } from '@/api/reviewApi';
import { ExchangeStatus } from '@/constants/exchange';
import { REVIEW_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import type { Review, ReviewDraft } from '@/models/review';
import { message } from '@/utils/message';

interface ReviewVisibility {
  public: boolean;
  mine: Review | undefined;
  counterpart: Review | undefined;
}

export const useReviewStore = defineStore('reviews', {
  state: () => ({
    reviews: [] as Review[],
    // 正在提交的 exchangeId 集合：提交期间禁用按钮，杜绝同页并发连点。
    submitting: [] as string[],
    loading: false,
  }),
  getters: {
    byExchange: (state) => (exchangeId: string) =>
      state.reviews.filter((review) => review.exchange_id === exchangeId),
    // 仅参与双方可见；双方都提交后才公开，任一条评价在公开前都不对外暴露内容。
    visibility:
      (state) =>
      (exchange: Exchange, currentUserId: string | undefined): ReviewVisibility | null => {
        if (!currentUserId) return null;
        const participants = [exchange.from_user_id, exchange.to_user_id];
        if (!participants.includes(currentUserId)) return null;
        const related = state.reviews.filter((review) => review.exchange_id === exchange.id);
        const mine = related.find((review) => review.reviewer_id === currentUserId);
        const counterpartId = participants.find((id) => id !== currentUserId);
        const counterpart = related.find((review) => review.reviewer_id === counterpartId);
        return { public: related.length === 2, mine, counterpart };
      },
    // 当前用户待评价的已完成交换数量（用于交换管理页统计）。
    pendingCount:
      (state) =>
      (exchanges: Exchange[], userId: string | undefined): number => {
        if (!userId) return 0;
        return exchanges.filter(
          (exchange) =>
            exchange.status === ExchangeStatus.COMPLETED &&
            (exchange.from_user_id === userId || exchange.to_user_id === userId) &&
            !state.reviews.some(
              (review) => review.exchange_id === exchange.id && review.reviewer_id === userId,
            ),
        ).length;
      },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.reviews = await reviewApi.list();
      } finally {
        this.loading = false;
      }
    },
    isSubmitting(exchangeId: string) {
      return this.submitting.includes(exchangeId);
    },
    async submit(draft: ReviewDraft) {
      // 同页并发/重复点击直接挡下，真正的幂等由 reviewApi 事务保证。
      if (this.submitting.includes(draft.exchange_id)) return null;
      this.submitting.push(draft.exchange_id);
      try {
        const result = await reviewApi.submit(draft);
        this.reviews = result.reviews;
        if (result.revealed) {
          message(REVIEW_MESSAGES.reviewRevealed, 'success');
        } else {
          message(REVIEW_MESSAGES.reviewSubmitted, 'success');
        }
        return result;
      } catch (error) {
        message(error instanceof Error ? error.message : REVIEW_MESSAGES.reviewFailed, 'error');
        return null;
      } finally {
        this.submitting = this.submitting.filter((id) => id !== draft.exchange_id);
      }
    },
  },
});
