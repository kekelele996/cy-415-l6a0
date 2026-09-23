<template>
  <div v-if="visible" class="review-dialog">
    <div class="review-dialog__mask" @click="$emit('cancel')" />
    <div class="review-dialog__panel" role="dialog" aria-modal="true" aria-label="评价交换">
      <header>
        <h3>评价本次交换</h3>
        <button type="button" class="review-dialog__close" @click="$emit('cancel')">×</button>
      </header>
      <p class="review-dialog__target">评价对象：<strong>{{ targetName }}</strong></p>

      <div class="review-dialog__row">
        <span>星级</span>
        <StarRating v-model="rating" />
        <small v-if="rating">{{ formatCreditDelta(rating) }}</small>
      </div>

      <template v-if="rating">
        <p class="review-dialog__hint">{{ formatRatingText(rating) }} · 选择 {{ REVIEW_MIN_TAGS }}-{{ REVIEW_MAX_TAGS }} 个标签</p>
        <ReviewTagPicker v-model="tags" :options="tagOptions" />
      </template>

      <footer>
        <button type="button" class="secondary-button" @click="$emit('cancel')">取消</button>
        <button type="button" class="primary-button" :disabled="submitting" @click="confirm">
          {{ submitting ? '提交中…' : '提交评价' }}
        </button>
      </footer>
      <p class="form-note">提交后不可修改；双方互评后内容同时公开。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import ReviewTagPicker from '@/components/common/ReviewTagPicker.vue';
import StarRating from '@/components/common/StarRating.vue';
import {
  REVIEW_MAX_TAGS,
  REVIEW_MIN_TAGS,
  reviewTagOptionsForRating,
} from '@/constants/review';
import type { ExchangeReviewDraft } from '@/models/review';
import { formatCreditDelta, formatRatingText } from '@/utils/formatters';
import { validateReviewDraft } from '@/utils/validators';
import { message } from '@/utils/message';

const props = defineProps<{
  visible: boolean;
  targetName: string;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  submit: [draft: ExchangeReviewDraft];
}>();

const rating = ref(0);
const tags = ref<string[]>([]);

// 每次打开都重置，避免刷新/重开时残留上一次的草稿
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      rating.value = 0;
      tags.value = [];
    }
  },
);

const tagOptions = computed(() => reviewTagOptionsForRating(rating.value));

const confirm = () => {
  const draft: ExchangeReviewDraft = { rating: rating.value, tags: tags.value };
  const error = validateReviewDraft(draft);
  if (error) {
    message(error, 'error');
    return;
  }
  emit('submit', draft);
};
</script>
