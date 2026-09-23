import { defineStore } from 'pinia';

import { reviewApi } from '@/api/reviewApi';
import { REVIEW_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import type { ExchangeReview, ExchangeReviewDraft, ExchangeReviewPair } from '@/models/review';
import { userApi } from '@/api/userApi';
import { useAuthStore } from '@/stores/authStore';
import { buildReviewPair, hasReviewed } from '@/utils/reviewVisibility';
import { message } from '@/utils/message';

export const useReviewStore = defineStore('reviews', {
  state: () => ({
    reviews: [] as ExchangeReview[],
    submitting: false,
  }),
  getters: {
    forExchange: (state) => (exchangeId: string) =>
      state.reviews.filter((item) => item.exchange_id === exchangeId),
    pairFor: (state) => (exchange: Exchange): ExchangeReviewPair => buildReviewPair(exchange, state.reviews),
    myReview:
      (state) =>
      (exchange: Exchange, userId: string): ExchangeReview | undefined =>
        state.reviews.find((item) => item.exchange_id === exchange.id && item.reviewer_id === userId),
    iHaveReviewed:
      (state) =>
      (exchange: Exchange, userId: string): boolean =>
        hasReviewed(exchange, state.reviews, userId),
  },
  actions: {
    async hydrate() {
      this.reviews = await reviewApi.list();
    },
    /**
     * 提交互评：评价、公开状态、信用分在 reviewApi 内原子提交。
     * 成功后同步刷新本地评价与用户（信用分），保证界面与存储一致。
     * 返回是否提交成功（失败时不关闭弹窗、不产生任何写入）。
     */
    async submit(exchange: Exchange, draft: ExchangeReviewDraft): Promise<boolean> {
      if (this.submitting) return false;
      const authStore = useAuthStore();
      if (!authStore.currentUser) {
        message(REVIEW_MESSAGES.notParticipant, 'error');
        return false;
      }
      this.submitting = true;
      try {
        await reviewApi.submitReview(exchange, authStore.currentUser.id, draft);
        this.reviews = await reviewApi.list();
        authStore.users = await userApi.list();
        authStore.currentUser =
          authStore.users.find((user) => user.id === authStore.currentUser?.id) ?? authStore.currentUser;
        const nextPair = buildReviewPair(exchange, this.reviews);
        message(nextPair.is_public ? REVIEW_MESSAGES.bothPublic : REVIEW_MESSAGES.submitted, 'success');
        return true;
      } catch (error) {
        message(error instanceof Error ? error.message : REVIEW_MESSAGES.failed, 'error');
        return false;
      } finally {
        this.submitting = false;
      }
    },
  },
});
