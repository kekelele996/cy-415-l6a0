<template>
  <section v-if="visibility" class="exchange-review">
    <header class="exchange-review__head">
      <strong>交换互评</strong>
      <small v-if="visibility.public">{{ REVIEW_MESSAGES.reviewReadOnly }}</small>
      <small v-else-if="visibility.mine">{{ REVIEW_MESSAGES.reviewWaiting }}</small>
      <small v-else>{{ REVIEW_MESSAGES.reviewPending }}</small>
    </header>

    <!-- 双方都已提交：两条评价同时公开 -->
    <div v-if="visibility.public && visibility.mine && visibility.counterpart" class="exchange-review__list">
      <div class="exchange-review__item">
        <span class="exchange-review__who">我对{{ counterpartName }}的评价</span>
        <ReviewContent :review="visibility.mine" />
      </div>
      <div class="exchange-review__item">
        <span class="exchange-review__who">{{ counterpartName }}对我的评价</span>
        <ReviewContent :review="visibility.counterpart" />
      </div>
    </div>

    <!-- 我已提交、对方未提交：本人看到“已评价”，看不到任何对方评价内容 -->
    <div v-else-if="visibility.mine" class="exchange-review__item exchange-review__item--locked">
      <span class="exchange-review__who">我的评价</span>
      <ReviewContent :review="visibility.mine" />
      <p class="exchange-review__hint">对方提交前，评价内容暂不对双方公开。</p>
    </div>

    <!-- 我尚未提交：填写 1~5 星和标签，对象固定为对方 -->
    <form v-else class="exchange-review__form" @submit.prevent="submit">
      <div class="exchange-review__target">
        评价对象：<strong>{{ counterpartName }}</strong>
      </div>
      <div class="exchange-review__stars" role="radiogroup" aria-label="星级">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          role="radio"
          :aria-checked="form.rating === star"
          :class="{ 'is-active': form.rating >= star }"
          :disabled="submitting"
          @click="form.rating = star"
        >
          ★
        </button>
        <span v-if="form.rating" class="exchange-review__delta">
          {{ formatRating(form.rating) }}（对方信用分 {{ formatCreditDelta(form.rating) }}）
        </span>
      </div>
      <div class="exchange-review__tags">
        <button
          v-for="tag in REVIEW_TAG_OPTIONS"
          :key="tag"
          type="button"
          :class="{ 'is-active': form.tags.includes(tag) }"
          :disabled="submitting"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
      <button class="primary-button" type="submit" :disabled="submitting">
        {{ submitting ? '提交中…' : '提交评价' }}
      </button>
      <p class="exchange-review__hint">每笔交换仅可评价一次；双方都提交后两条评价同时公开。</p>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';

import { REVIEW_TAG_OPTIONS } from '@/constants/review';
import { REVIEW_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import { useAuthStore } from '@/stores/authStore';
import { useReviewStore } from '@/stores/reviewStore';
import { formatCreditDelta, formatRating } from '@/utils/formatters';
import { validateReviewDraft } from '@/utils/validators';
import { message } from '@/utils/message';

import ReviewContent from './ReviewContent.vue';

const props = defineProps<{
  exchange: Exchange;
  users: import('@/models/user').User[];
}>();

const emit = defineEmits<{
  submitted: [];
}>();

const authStore = useAuthStore();
const reviewStore = useReviewStore();

const viewerId = computed(() => authStore.currentUser?.id);
const visibility = computed(() =>
  viewerId.value ? reviewStore.visibility(props.exchange, viewerId.value) : null,
);
const counterpartId = computed(() =>
  props.exchange.from_user_id === viewerId.value
    ? props.exchange.to_user_id
    : props.exchange.from_user_id,
);
const counterpartName = computed(
  () => props.users.find((user) => user.id === counterpartId.value)?.nickname ?? '对方',
);
const submitting = computed(() => reviewStore.isSubmitting(props.exchange.id));

const form = reactive({ rating: 0, tags: [] as string[] });

const toggleTag = (tag: string) => {
  if (submitting.value) return;
  form.tags = form.tags.includes(tag)
    ? form.tags.filter((item) => item !== tag)
    : [...form.tags, tag];
};

const submit = async () => {
  if (!viewerId.value) {
    message(REVIEW_MESSAGES.reviewUnavailable, 'error');
    return;
  }
  const error = validateReviewDraft(form);
  if (error) {
    message(error, 'error');
    return;
  }
  const result = await reviewStore.submit({
    exchange_id: props.exchange.id,
    reviewer_id: viewerId.value,
    reviewee_id: counterpartId.value,
    rating: form.rating,
    tags: [...form.tags],
  });
  if (result) {
    form.rating = 0;
    form.tags = [];
    // 通知父组件刷新用户信用分等数据（评价与信用分在同一次提交里已原子落库）。
    emit('submitted');
  }
};
</script>
