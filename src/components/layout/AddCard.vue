<script setup lang="ts">
import {PhPlus} from '@phosphor-icons/vue';

defineProps<{
  size: number;
  radius: number;
  showName: boolean;
  textSize: number;
}>();

defineEmits<{
  (e: 'click'): void;
}>();
</script>

<template>
  <div class="ignore-drag w-full flex justify-center" @click="$emit('click')">
    <div
        class="flex flex-col items-center gap-2 cursor-pointer group hover:-translate-y-1 transition-transform p-1 rounded-xl"
    >
      <div
          class="add-card flex items-center justify-center transition-all group-hover:shadow-lg group-hover:brightness-110"
          :style="{ width: size + 'px', height: size + 'px', borderRadius: radius + 'px' }"
      >
        <PhPlus
            :size="size * 0.5"
            weight="light"
            class="text-gray-400 group-hover:text-[var(--accent-color)] transition-colors"
        />
      </div>

      <span
          v-if="showName"
          class="font-bold text-center leading-tight opacity-50 group-hover:opacity-100 transition-opacity truncate"
          :style="{ width: (size + 16) + 'px', fontSize: textSize + 'px', color: 'var(--text-primary)' }"
      >
        添加
      </span>
    </div>
  </div>
</template>
