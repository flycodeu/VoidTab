<script setup lang="ts">
import {computed} from "vue";
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useStateStore} from "../../../stores/useStateStore.ts";
import type {SiteItem, BookmarkDensity} from "../../../core/config/types.ts";
import SiteIcon from "./SiteIcon.vue";
import {useAutoIcon} from "../../../shared/composables/icon/useAutoIcon.ts";

const store = useConfigStore();
const statsStore = useStateStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
  density?: BookmarkDensity;
}>();

const isAuto = computed(() => props.item.iconType === "auto" || !props.item.iconType);

const displayText = computed(() => {
  if (props.item.iconType !== "text") return "";
  if (props.item.iconValue && props.item.iconValue.length > 0) return props.item.iconValue;
  const clean = (props.item.title || "").trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
  if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2);
  return (clean.substring(0, 4).toUpperCase() || (props.item.title || "A").substring(0, 2));
});

const dynamicFontSize = computed(() => {
  const baseSize = Number(store.config.theme.iconSize);
  const len = (displayText.value || "").length;
  if (len >= 4) return baseSize * 0.3;
  if (len === 3) return baseSize * 0.35;
  if (len === 2) return baseSize * 0.42;
  return baseSize * 0.5;
});

const labelH = computed(() => {
  if (!store.config.theme.showIconName) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});

const {autoIconUrl, isLoaded, handleImgLoad, triggerFallback} = useAutoIcon({
  url: computed(() => props.item.url || ""),
  isAuto,
  timeoutMs: 2500,
  onFallback: () => store.setIconFallback(props.item.id),
});

const handleClick = (e: MouseEvent) => {
  if (props.isEditMode) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  statsStore.recordVisit(props.item.id);
};
</script>

<template>
  <a
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="group w-full h-full min-h-0 min-w-0 rounded-xl overflow-hidden transition-all duration-200"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'hover:-translate-y-1 cursor-pointer']"
  >
    <!-- ✅ 用 grid 两行，保证 1×1 cell 内完成 icon+label，不撑格子 -->
    <div class="w-full h-full min-h-0 grid" :style="{ gridTemplateRows: `1fr ${labelH}px` }">
      <div class="min-h-0 w-full flex items-center justify-center">
        <SiteIcon
            :item="item"
            :size="Number(store.config.theme.iconSize)"
            :radius="Number(store.config.theme.radius)"
            :isAuto="isAuto"
            :autoIconUrl="autoIconUrl"
            :isLoaded="isLoaded"
            :text="displayText"
            :textFontSize="dynamicFontSize"
            :density="density"
            @loaded="handleImgLoad"
            @fallback="triggerFallback"
        />
      </div>

      <div v-if="store.config.theme.showIconName" class="w-full flex items-center justify-center px-1">
        <span
            class="w-full truncate text-center leading-tight"
            :style="{
            fontSize: store.config.theme.iconTextSize + 'px',
            color: 'var(--text-primary)',
            textShadow: '0 1px 2px rgba(0,0,0,0.45)'
          }"
        >
          {{ item.title }}
        </span>
      </div>

      <div v-else/>
    </div>
  </a>
</template>
