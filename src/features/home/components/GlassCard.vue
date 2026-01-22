<script setup lang="ts">
import {computed, ref, watch, onMounted, onUnmounted, nextTick} from "vue";
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

watch(
    () => props.item.url,
    () => (hasLoadError.value = false)
);

const displayText = computed(() => {
  if (props.item.iconType === "text" || (isAuto.value && hasLoadError.value)) {
    if (props.item.iconValue?.length) return props.item.iconValue.substring(0, 4);
    const clean = (props.item.title || "")
        .trim()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
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

/**
 * 你现在配置里没有 tags，所以只保留：
 * - showRemark / showDomain
 * - w/h (用于 2×1 / 3×1)
 */
const cardCfg = computed(() => {
  const def = {showRemark: true, showDomain: true, w: 2, h: 1};
  return (store.config.theme as any).siteCard
      ? {...def, ...(store.config.theme as any).siteCard}
      : def;
});

const iconSize = computed(() => Number(store.config.theme.iconSize || 72));
const cardRadius = computed(() => Number(store.config.theme.radius || 16));

/** ---------------------------
 * domain / remark
 * -------------------------- */
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

/** =========================
 * 自适应密度（解决 2×1 遮盖 & 3×1 小屏太挤）
 * ========================= */
type DensityMode = "wide" | "compact" | "tiny";
const densityMode = ref<DensityMode>("wide");

const cardEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;

const updateDensity = (w: number) => {
  // 阈值你可按实际 grid 调整
  if (w <= 230) densityMode.value = "tiny";
  else if (w <= 320) densityMode.value = "compact";
  else densityMode.value = "wide";
};

/**  切换 2×1 / 3×1 时强制 nextTick 后重新测量一次 */
const ensureObserveAndMeasure = async () => {
  await nextTick();
  if (!cardEl.value) return;

  // 确保 RO 挂上（有些情况下 onMounted 先于 ref）
  if (!ro) {
    ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      updateDensity(box.width);
    });
    ro.observe(cardEl.value);
  }

  // 强制测量一次，避免 “2×1 -> 3×1 备注不回来”
  const w = cardEl.value.getBoundingClientRect().width;
  if (w) updateDensity(w);
};

onMounted(() => {
  ensureObserveAndMeasure();
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
});

/**  布局跨度变化 / 模式变化时，强制重新测量 */
watch(
    () => [mode.value, cardCfg.value.w, cardCfg.value.h],
    () => {
      ensureObserveAndMeasure();
    }
);

/** ---------------------------
 * card icon size / spacing — 根据 densityMode 动态变化
 * -------------------------- */
const cardIconSize = computed(() => {
  if (densityMode.value === "tiny") return 40;
  if (densityMode.value === "compact") return 46;
  return 52;
});

const cardIconRadius = computed(() => {
  if (densityMode.value === "tiny") return 14;
  if (densityMode.value === "compact") return 15;
  return 16;
});

const cardTextFontSize = computed(() => {
  const base = cardIconSize.value;
  const len = (displayText.value || "").length;
  if (len >= 4) return base * 0.28;
  if (len === 3) return base * 0.32;
  if (len === 2) return base * 0.4;
  return base * 0.48;
});

/**  修复：2×1 也必须有备注 —— 不再因为 tiny 被隐藏 */
const showRemarkRow = computed(() => {
  if (!cardCfg.value.showRemark) return false;
  return !!remarkText.value;
});

/**
 * 可选策略：tiny 时隐藏 domain，把空间留给 remark（推荐）
 * 这样 2×1 超窄时：标题 + 备注，不遮盖
 */
const showDomainRow = computed(() => {
  if (!cardCfg.value.showDomain || !domain.value) return false;
  if (densityMode.value === "tiny") return false;
  return true;
});
</script>

<template>
  <!-- 卡片布局 -->
  <a
      v-if="mode === 'card'"
      ref="cardEl"
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="site-card group block w-full h-full min-w-0 min-h-0 select-none"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
      :data-density="densityMode"
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
          <!-- Title -->
          <div class="row row1 min-w-0">
            <div class="title truncate">
              {{ item.title || "未命名" }}
            </div>
            <div class="dot" aria-hidden="true"></div>
          </div>

          <!-- Domain -->
          <div v-if="showDomainRow" class="row row2 truncate">
            {{ domain }}
          </div>

          <!-- Remark -->
          <div class="row row3 min-w-0">
            <div v-if="showRemarkRow" class="sub truncate">
              {{ remarkText }}
            </div>
            <div v-else class="sub opacity-40 truncate">—</div>
          </div>
        </div>
      </div>
    </div>
  </a>

  <!-- 图标布局（保持原逻辑） -->
  <a
      v-else
      :href="item.url"
      target="_blank"
      @click="handleClick"
      class="group flex flex-col items-center justify-start transition-all duration-200"
      :class="[props.isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer']"
      :style="{ width: '100%', height: '100%' }"
  >
    <div class="flex-shrink-0 relative transition-transform duration-200 group-hover:-translate-y-1"
         :style="iconContainerStyle">
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
          textShadow: '0 1px 2px rgba(0,0,0,0.45)',
        }"
      >
        {{ item.title }}
      </span>
    </div>
  </a>
</template>

<style scoped>
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

  border: 1px solid rgba(var(--overlay-rgb), 0.22);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.10) inset,
  0 12px 28px rgba(0, 0, 0, 0.08);

  background: rgba(var(--overlay-rgb), 0.14);

  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);

  transition: transform 0.18s ease,
  border-color 0.18s ease,
  box-shadow 0.18s ease,
  background 0.18s ease;
}

.site-card:hover .card-shell {
  transform: translateY(-2px);
  border-color: rgba(var(--accent-color-rgb), 0.30);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.10) inset,
  0 0 0 1px rgba(var(--accent-color-rgb), 0.16),
  0 14px 34px rgba(0, 0, 0, 0.10),
  0 8px 22px rgba(var(--accent-color-rgb), 0.10);
  background: rgba(var(--overlay-rgb), 0.16);
}

/* 别用 align-items:center，否则高度小会“上下裁切感”更明显 */
.card-inner {
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;

  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 14px;

  align-items: stretch;
}

.card-left {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-right {
  min-width: 0;
  display: grid;
  gap: 6px;
  align-content: center;
}

.row {
  min-width: 0;
}

.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.title {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.15;
  color: var(--text-primary);
}

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
  line-height: 1.15;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--text-secondary);
  opacity: 0.78;
}

.row3 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.sub {
  font-size: 12px;
  line-height: 1.15;
  color: var(--text-primary);
  opacity: 0.72;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 密度自适应：compact */
.site-card[data-density="compact"] .card-inner {
  gap: 10px;
  padding: 10px 12px;
}

.site-card[data-density="compact"] .title {
  font-size: 13px;
}

.site-card[data-density="compact"] .row2 {
  font-size: 11px;
  opacity: 0.74;
}

.site-card[data-density="compact"] .sub {
  font-size: 11px;
  opacity: 0.70;
}

/* tiny：更紧凑，但  备注仍然显示 */
.site-card[data-density="tiny"] .card-inner {
  gap: 10px;
  padding: 10px 10px;
}

.site-card[data-density="tiny"] .title {
  font-size: 12.5px;
}

.site-card[data-density="tiny"] .row2 {
  font-size: 11px;
  opacity: 0.70;
}

.site-card[data-density="tiny"] .sub {
  font-size: 11px;
  opacity: 0.66;
}

.site-card[data-density="tiny"] .dot {
  display: none;
}
</style>
