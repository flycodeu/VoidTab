<script setup lang="ts">
import {computed, ref, watch} from "vue";
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useUiStore} from "../../../stores/ui/useUiStore.ts";
import type {SiteItem, BookmarkDensity} from "../../../core/config/types.ts";
import SiteIcon from "./SiteIcon.vue";

const store = useConfigStore();
const ui = useUiStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
  density?: BookmarkDensity;
}>();

/** ---------------------------
 * icon / fallback
 * -------------------------- */
const hasLoadError = ref(false);
const isAuto = computed(() => props.item.iconType === "auto" || !props.item.iconType);

const autoIconUrl = computed(() => {
  if (!props.item.url) return "";
  try {
    const domain = new URL(props.item.url).hostname;
    return `https://unavatar.io/${domain}?fallback=https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch {
    return "";
  }
});

watch(() => props.item.url, () => (hasLoadError.value = false));

const displayText = computed(() => {
  if (props.item.iconType === "text" || (isAuto.value && hasLoadError.value)) {
    if (props.item.iconValue?.length) return props.item.iconValue.substring(0, 4);
    const clean = (props.item.title || "").trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    return clean.substring(0, 4).toUpperCase() || (props.item.title || "A").substring(0, 2);
  }
  return "";
});

const handleFallback = () => (hasLoadError.value = true);
const handleImgLoad = () => (hasLoadError.value = false);

/** ---------------------------
 * layout mode
 * -------------------------- */
const mode = computed(() => (store.config.theme as any).siteLayoutMode || "icon");

// card 可选开关
const cardCfg = computed(() => {
  const def = {showRemark: true, showDomain: true};
  return (store.config.theme as any).siteCard
      ? {...def, ...(store.config.theme as any).siteCard}
      : def;
});

const iconSize = computed(() => Number(store.config.theme.iconSize || 72));
const cardRadius = computed(() => Number(store.config.theme.radius || 16));

/** card: 固定视觉尺寸（不要跟 iconSize 浮动太大，否则会乱） */
const cardIconSize = computed(() => 52);
const cardIconRadius = computed(() => 16);

const cardTextFontSize = computed(() => {
  const base = cardIconSize.value;
  const len = (displayText.value || "").length;
  if (len >= 4) return base * 0.28;
  if (len === 3) return base * 0.32;
  if (len === 2) return base * 0.40;
  return base * 0.48;
});

const domain = computed(() => {
  const raw = String(props.item.url || "");
  if (!raw) return "";
  try {
    const u = raw.startsWith("http") ? new URL(raw) : new URL("https://" + raw);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
});

const remarkText = computed(() => (props.item.remark || "").trim());

const handleClick = (e: MouseEvent) => {
  if (props.isEditMode || ui.dragState.isDragging) {
    e.preventDefault();
    e.stopPropagation();
  }
};

/** icon 模式 label 高度 */
const labelH = computed(() => {
  if (!store.config.theme.showIconName) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});

const iconContainerStyle = computed(() => ({
  width: `${iconSize.value}px`,
  height: `${iconSize.value}px`,
}));
</script>

<template>
  <!--   卡片布局（2×1） -->
  <a
      v-if="mode === 'card'"
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="site-card group block w-full h-full min-w-0 min-h-0 select-none"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
  >
    <div class="card-shell w-full h-full min-w-0 min-h-0" :style="{ borderRadius: cardRadius + 'px' }">
      <div class="card-inner w-full h-full min-w-0 min-h-0">
        <!-- Left -->
        <div class="card-left">
          <SiteIcon
              :item="item"
              :size="cardIconSize"
              :radius="cardIconRadius"
              :isAuto="isAuto"
              :autoIconUrl="autoIconUrl"
              :hasError="hasLoadError"
              :text="displayText"
              :textFontSize="cardTextFontSize"
              :density="density"
              @loaded="handleImgLoad"
              @fallback="handleFallback"
          />
        </div>

        <!-- Right -->
        <div class="card-right min-w-0">
          <!-- Row 1: title + tiny indicator -->
          <div class="row row1 min-w-0">
            <div class="title truncate">
              {{ item.title || "未命名" }}
            </div>

            <!-- 可选：右侧极简指示位（不想要可直接删掉） -->
            <div class="dot" aria-hidden="true"></div>
          </div>

          <!-- Row 2: domain -->
          <div v-if="cardCfg.showDomain && domain" class="row row2 truncate">
            {{ domain }}
          </div>

          <!-- Row 3: remark（没有就显示占位） -->
          <div class="row row3 min-w-0">
            <div v-if="cardCfg.showRemark && remarkText" class="sub truncate">
              {{ remarkText }}
            </div>
            <div v-else class="sub opacity-40 truncate">—</div>
          </div>
        </div>
      </div>
    </div>
  </a>

  <!--   简洁布局（保持原功能） -->
  <a
      v-else
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="group flex flex-col items-center justify-start transition-all duration-200"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
      :style="{ width: '100%', height: '100%' }"
  >
    <div
        class="flex-shrink-0 relative transition-transform duration-200 group-hover:-translate-y-1"
        :style="iconContainerStyle"
    >
      <SiteIcon
          :item="item"
          :size="Number(store.config.theme.iconSize)"
          :radius="Number(store.config.theme.radius)"
          :isAuto="isAuto"
          :autoIconUrl="autoIconUrl"
          :hasError="hasLoadError"
          :text="displayText"
          :textFontSize="(() => {
          const base = Number(store.config.theme.iconSize || 72);
          const len = (displayText || '').length;
          if (len >= 4) return base * 0.3;
          if (len === 3) return base * 0.35;
          if (len === 2) return base * 0.42;
          return base * 0.5;
        })()"
          :density="density"
          @loaded="handleImgLoad"
          @fallback="handleFallback"
      />
    </div>

    <div
        v-if="store.config.theme.showIconName"
        class="w-full flex items-center justify-center px-1 mt-1"
        :style="{ height: labelH + 'px' }"
    >
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
  </a>
</template>

<style scoped>
/* 让卡片在 2×1 中稳定：高度由 gridRowHeight 控制，内部绝不撑开 */
.site-card {
  min-width: 0;
  min-height: 0;
}
.card-shell {
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  /*   清晰边框：外边框 + 内描边 */
  border: 1px solid rgba(var(--overlay-rgb), 0.22);
  box-shadow:
      0 0 0 1px rgba(255,255,255, 0.10) inset,
      0 12px 28px rgba(0,0,0, 0.08);

  /*   玻璃底：不用 calc，避免失效 */
  background: rgba(var(--overlay-rgb), 0.14);

  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);

  transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;
}

.site-card:hover .card-shell {
  transform: translateY(-2px);

  /*   hover 更明确：accent 边界更清楚 */
  border-color: rgba(var(--accent-color-rgb), 0.30);

  box-shadow:
      0 0 0 1px rgba(255,255,255, 0.10) inset,
      0 0 0 1px rgba(var(--accent-color-rgb), 0.16),
      0 14px 34px rgba(0,0,0, 0.10),
      0 8px 22px rgba(var(--accent-color-rgb), 0.10);

  background: rgba(var(--overlay-rgb), 0.16);
}



.site-card:hover .card-shell {
  transform: translateY(-2px);
  border-color: rgba(var(--accent-color-rgb), 0.20);
  background: rgba(var(--overlay-rgb), 0.16);
}

/* 内部布局：固定对齐，不允许“自己长高” */
.card-inner {
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 12px;
  padding: 14px;
  align-items: center;
}

.card-left {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-right {
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 6px;
  min-width: 0;
}

.row {
  min-width: 0;
}

.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.title {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.2;
  color: var(--text-primary);
}

/* 极简指示位：不占空间、不影响对齐（不想要可删） */
.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(var(--overlay-rgb), 0.28);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
}

.row2 {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--text-secondary);
  opacity: 0.75;
}

.row3 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub {
  font-size: 12px;
  color: var(--text-primary);
  opacity: 0.72;
}

/* 防止任何文本撑开布局 */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
