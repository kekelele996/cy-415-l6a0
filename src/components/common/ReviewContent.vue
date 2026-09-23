<template>
  <div class="review-content">
    <span class="review-content__stars" :title="`${review.rating} 星`">
      {{ formatRating(review.rating) }}
    </span>
    <div class="review-content__tags">
      <span v-for="tag in review.tags" :key="tag" class="review-content__tag">{{ tag }}</span>
    </div>
    <small class="review-content__time">{{ formatDate(review.created_at) }}</small>
  </div>
</template>

<script setup lang="ts">
import type { Review } from '@/models/review';

import { formatDate, formatRating } from '@/utils/formatters';

defineProps<{
  review: Review;
}>();
</script>
