<template>
  <div class="star-rating" :class="{ 'star-rating--readonly': readonly }" role="radiogroup" aria-label="星级评分">
    <button
      v-for="star in 5"
      :key="star"
      type="button"
      :aria-checked="modelValue === star"
      :aria-label="`${star} 星`"
      :class="{ 'star-rating__star--active': star <= modelValue }"
      :disabled="readonly"
      role="radio"
      @click="readonly ? undefined : $emit('update:modelValue', star)"
      @mouseenter="hover = readonly ? 0 : star"
      @mouseleave="hover = 0"
    >
      ★
    </button>
    <span v-if="showText" class="star-rating__text">{{ displayRating }} 星</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    readonly?: boolean;
    showText?: boolean;
  }>(),
  { readonly: false, showText: false },
);

defineEmits<{
  'update:modelValue': [value: number];
}>();

const hover = ref(0);
const displayRating = computed(() => hover.value || props.modelValue);
</script>
