<template>
  <article class="review-card">
    <header>
      <strong>{{ authorName }}</strong>
      <StarRating :model-value="review.rating" readonly show-text />
    </header>
    <ul v-if="review.tags.length" class="review-card__tags">
      <li
        v-for="tag in review.tags"
        :key="tag"
        class="review-card__tag"
        :class="`review-card__tag--${REVIEW_TAG_TONE[tag] ?? 'positive'}`"
      >
        {{ tag }}
      </li>
    </ul>
    <small>{{ formatDate(review.created_at) }}</small>
  </article>
</template>

<script setup lang="ts">
import StarRating from '@/components/common/StarRating.vue';
import { REVIEW_TAG_TONE } from '@/constants/review';
import type { ExchangeReview } from '@/models/review';
import { formatDate } from '@/utils/formatters';

defineProps<{
  review: ExchangeReview;
  authorName: string;
}>();
</script>
