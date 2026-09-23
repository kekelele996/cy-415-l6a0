<template>
  <div class="tag-picker">
    <button
      v-for="tag in options"
      :key="tag"
      type="button"
      class="tag-picker__item"
      :class="{ 'tag-picker__item--active': modelValue.includes(tag) }"
      :disabled="!modelValue.includes(tag) && modelValue.length >= REVIEW_MAX_TAGS"
      @click="toggle(tag)"
    >
      {{ tag }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { REVIEW_MAX_TAGS } from '@/constants/review';

const props = defineProps<{
  modelValue: string[];
  options: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const toggle = (tag: string) => {
  if (props.modelValue.includes(tag)) {
    emit(
      'update:modelValue',
      props.modelValue.filter((item) => item !== tag),
    );
    return;
  }
  if (props.modelValue.length >= REVIEW_MAX_TAGS) return;
  emit('update:modelValue', [...props.modelValue, tag]);
};
</script>
