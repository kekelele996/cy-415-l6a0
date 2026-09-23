<template>
  <div v-if="isParticipant" class="review-summary">
    <!-- 已完成且本人未评价：去评价 -->
    <button v-if="!mine" type="button" class="review-summary__cta" @click="$emit('review')">
      评价本次交换
    </button>

    <!-- 本人已评价，等待对方：本人可见自己的内容，对方评价不可见 -->
    <template v-else-if="!pair.is_public">
      <p class="review-summary__waiting">{{ REVIEW_MESSAGES.waitingPeer }}</p>
      <ReviewCard :review="mine" :author-name="currentUser!.nickname" />
    </template>

    <!-- 双方都已提交：两条评价同时公开 -->
    <template v-else>
      <ReviewCard
        v-if="pair.fromReview"
        :review="pair.fromReview"
        :author-name="nameOf(pair.fromReview.reviewer_id)"
      />
      <ReviewCard
        v-if="pair.toReview"
        :review="pair.toReview"
        :author-name="nameOf(pair.toReview.reviewer_id)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import ReviewCard from '@/components/common/ReviewCard.vue';
import { REVIEW_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import type { ExchangeReviewPair } from '@/models/review';
import type { User } from '@/models/user';

const props = defineProps<{
  exchange: Exchange;
  pair: ExchangeReviewPair;
  users: User[];
  currentUserId: string;
}>();

defineEmits<{
  review: [];
}>();

const isParticipant = computed(
  () => props.exchange.from_user_id === props.currentUserId || props.exchange.to_user_id === props.currentUserId,
);

const mine = computed(
  () =>
    props.pair.fromReview?.reviewer_id === props.currentUserId
      ? props.pair.fromReview
      : props.pair.toReview?.reviewer_id === props.currentUserId
        ? props.pair.toReview
        : undefined,
);

const currentUser = computed(() => props.users.find((user) => user.id === props.currentUserId));
const nameOf = (userId: string) => props.users.find((user) => user.id === userId)?.nickname ?? '对方';
</script>
