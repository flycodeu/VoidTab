<script setup lang="ts">
import {computed, ref, watch, onMounted, onUnmounted, nextTick} from "vue";
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useUiStore} from "../../../stores/ui/useUiStore.ts";
import type {SiteItem, BookmarkDensity} from "../../../core/config/types.ts";
import SiteIcon from "./SiteIcon.vue";
import {markSiteIconMiss, resolveAndCacheSiteIcon} from "../../../shared/utils/siteIconCache.ts";
import {isDirectIconSource} from "../../../shared/utils/icon.ts";

const store = useConfigStore();
const ui = useUiStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
  density?: BookmarkDensity;
  cardSpanW?: number;
  cardSpanH?: number;
}>();

/** ---------------------------
 * icon / fallback
 * -------------------------- */
const hasLoadError = ref(false);
const normalizedIconType = computed(() => {
  const t = props.item.iconType;
  if (t === "text" || t === "icon") return t;
  return "auto";
});
const isAuto = computed(() => normalizedIconType.value === "auto");
const autoIconUrl = ref("");
const isObjectUrl = ref(false);
const resolveToken = ref(0);
const hasTriedForceRefresh = ref(false);
const iconSourceMode = ref<"auto" | "direct" | "none">("none");

const revokeObjectUrl = () => {
  if (isObjectUrl.value && autoIconUrl.value.startsWith("blob:")) {
    URL.revokeObjectURL(autoIconUrl.value);
  }
  isObjectUrl.value = false;
};

const setAutoIconUrl = (url: string, objectUrl: boolean) => {
  revokeObjectUrl();
  autoIconUrl.value = url;
  isObjectUrl.value = objectUrl;
};

const getDirectIconUrl = () => {
  const raw = typeof props.item.icon === "string" ? props.item.icon.trim() : "";
  return isDirectIconSource(raw) ? raw : "";
};

const applyDirectIconFallback = (): boolean => {
  const direct = getDirectIconUrl();
  if (!direct) return false;
  hasLoadError.value = false;
  iconSourceMode.value = "direct";
  setAutoIconUrl(direct, false);
  return true;
};

const resolveAutoIcon = async (forceRefresh = false) => {
  if (!isAuto.value) {
    setAutoIconUrl("", false);
    iconSourceMode.value = "none";
    return;
  }

  const directIconUrl = getDirectIconUrl();
  if (directIconUrl && !forceRefresh) {
    hasLoadError.value = false;
    iconSourceMode.value = "direct";
    setAutoIconUrl(directIconUrl, false);
  }

  if (!props.item.url) {
    if (applyDirectIconFallback()) return;
    setAutoIconUrl("", false);
    iconSourceMode.value = "none";
    hasLoadError.value = true;
    return;
  }

  const token = ++resolveToken.value;
  const result = await resolveAndCacheSiteIcon(props.item.url, store.config.runtime, {
    forceRefresh,
    fastFirst: true,
    fastTimeoutMs: 700,
  });

  if (token !== resolveToken.value) {
    if (result?.objectUrl && result.url.startsWith("blob:")) URL.revokeObjectURL(result.url);
    return;
  }

  if (!result?.url) {
    if (applyDirectIconFallback()) return;
    iconSourceMode.value = "none";
    setAutoIconUrl("", false);
    hasLoadError.value = true;
    return;
  }

  hasLoadError.value = false;
  iconSourceMode.value = "auto";
  setAutoIconUrl(result.url, !!result.objectUrl);
};

watch(
    () => [props.item.url, props.item.iconType, props.item.icon],
    () => {
      hasLoadError.value = false;
      hasTriedForceRefresh.value = false;
      void resolveAutoIcon(false);
    },
    {immediate: true}
);

const displayText = computed(() => {
  if (normalizedIconType.value === "text" || (isAuto.value && hasLoadError.value)) {
    if (props.item.iconValue?.length) return props.item.iconValue.substring(0, 4);
    const clean = (props.item.title || "")
        .trim()
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
    return clean.substring(0, 4).toUpperCase() || (props.item.title || "A").substring(0, 2);
  }
  return "";
});

const handleFallback = () => {
  if (!isAuto.value) {
    hasLoadError.value = true;
    return;
  }

  if (iconSourceMode.value === "auto" && props.item.url && !!autoIconUrl.value) {
    markSiteIconMiss(props.item.url, store.config.runtime, {error: "img_error", preserveExisting: true});
    if (!hasTriedForceRefresh.value) {
      hasTriedForceRefresh.value = true;
      void resolveAutoIcon(true);
      return;
    }
  }

  if (iconSourceMode.value !== "direct" && applyDirectIconFallback()) {
    return;
  }

  hasLoadError.value = true;
};
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
 * 自适应密度：按占位规格（1x1 / 2x1 / 3x1）和宽度双重计算
 * ========================= */
type DensityMode = "wide" | "compact" | "tiny";
type CardLayoutMode = "1x1" | "2x1" | "3x1" | "other";
const densityMode = ref<DensityMode>("wide");

const clampSpan = (v: unknown, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(4, Math.round(n)));
};

const cardSpanW = computed(() => clampSpan(props.cardSpanW ?? cardCfg.value.w, 2));
const cardSpanH = computed(() => clampSpan(props.cardSpanH ?? cardCfg.value.h, 1));

const cardLayoutMode = computed<CardLayoutMode>(() => {
  const w = cardSpanW.value;
  const h = cardSpanH.value;
  if (w === 1 && h === 1) return "1x1";
  if (w === 2 && h === 1) return "2x1";
  if (w >= 3 && h === 1) return "3x1";
  return "other";
});

const cardEl = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;

const updateDensity = (w: number) => {
  if (cardLayoutMode.value === "1x1") {
    if (w <= 170) densityMode.value = "tiny";
    else if (w <= 230) densityMode.value = "compact";
    else densityMode.value = "wide";
    return;
  }
  if (cardLayoutMode.value === "2x1") {
    if (w <= 280) densityMode.value = "tiny";
    else if (w <= 380) densityMode.value = "compact";
    else densityMode.value = "wide";
    return;
  }
  if (cardLayoutMode.value === "3x1") {
    if (w <= 420) densityMode.value = "tiny";
    else if (w <= 560) densityMode.value = "compact";
    else densityMode.value = "wide";
    return;
  }
  if (w <= 240) densityMode.value = "tiny";
  else if (w <= 340) densityMode.value = "compact";
  else densityMode.value = "wide";
};

const ensureObserveAndMeasure = async () => {
  await nextTick();
  if (!cardEl.value) return;

  if (!ro) {
    ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      updateDensity(box.width);
    });
    ro.observe(cardEl.value);
  }

  const w = cardEl.value.getBoundingClientRect().width;
  if (w) updateDensity(w);
};

onMounted(() => {
  ensureObserveAndMeasure();
});

onUnmounted(() => {
  ro?.disconnect();
  ro = null;
  revokeObjectUrl();
});

/**  布局跨度变化 / 模式变化时，强制重新测量 */
watch(
    () => [mode.value, cardCfg.value.w, cardCfg.value.h, cardSpanW.value, cardSpanH.value],
    () => {
      ensureObserveAndMeasure();
    }
);

/** ---------------------------
 * card icon size / spacing
 * -------------------------- */
const cardIconSize = computed(() => {
  if (cardLayoutMode.value === "1x1") {
    if (densityMode.value === "tiny") return 34;
    if (densityMode.value === "compact") return 38;
    return 42;
  }
  if (cardLayoutMode.value === "2x1") {
    if (densityMode.value === "tiny") return 38;
    if (densityMode.value === "compact") return 44;
    return 48;
  }
  if (cardLayoutMode.value === "3x1") {
    if (densityMode.value === "tiny") return 42;
    if (densityMode.value === "compact") return 50;
    return 56;
  }
  if (densityMode.value === "tiny") return 40;
  if (densityMode.value === "compact") return 46;
  return 52;
});

const cardIconRadius = computed(() => {
  if (cardLayoutMode.value === "1x1") return 12;
  if (densityMode.value === "tiny") return 13;
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

const showDot = computed(() => cardLayoutMode.value !== "1x1" && densityMode.value !== "tiny");

const showRemarkRow = computed(() => {
  if (!cardCfg.value.showRemark || !remarkText.value) return false;
  if (cardLayoutMode.value === "1x1") return false;
  return true;
});

/**
 * 可选策略：tiny 时隐藏 domain，把空间留给 remark（推荐）
 * 这样 2×1 超窄时：标题 + 备注，不遮盖
 */
const showDomainRow = computed(() => {
  if (!cardCfg.value.showDomain || !domain.value) return false;
  if (cardLayoutMode.value === "1x1") return false;
  if (densityMode.value === "tiny") return false;
  if (cardLayoutMode.value === "2x1" && densityMode.value === "compact") return false;
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
      :data-layout="cardLayoutMode"
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
            <div v-if="showDot" class="dot" aria-hidden="true"></div>
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

.site-card[data-layout="1x1"] .card-inner {
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
  gap: 8px;
  padding: 10px;
  justify-items: center;
}

.site-card[data-layout="1x1"] .card-right {
  width: 100%;
  gap: 4px;
  align-content: start;
}

.site-card[data-layout="1x1"] .row1 {
  justify-content: center;
}

.site-card[data-layout="1x1"] .title {
  text-align: center;
  font-size: 12px;
}

.site-card[data-layout="1x1"] .row3 {
  display: none;
}

.site-card[data-layout="3x1"] .card-inner {
  gap: 14px;
  padding: 12px 16px;
}

.site-card[data-layout="3x1"] .title {
  font-size: 15px;
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
.site-card[data-layout="2x1"][data-density="compact"] .card-inner,
.site-card[data-layout="3x1"][data-density="compact"] .card-inner,
.site-card[data-layout="other"][data-density="compact"] .card-inner {
  gap: 10px;
  padding: 10px 12px;
}

.site-card[data-layout="2x1"][data-density="compact"] .title,
.site-card[data-layout="3x1"][data-density="compact"] .title,
.site-card[data-layout="other"][data-density="compact"] .title {
  font-size: 13px;
}

.site-card[data-layout="2x1"][data-density="compact"] .row2,
.site-card[data-layout="3x1"][data-density="compact"] .row2,
.site-card[data-layout="other"][data-density="compact"] .row2 {
  font-size: 11px;
  opacity: 0.74;
}

.site-card[data-layout="2x1"][data-density="compact"] .sub,
.site-card[data-layout="3x1"][data-density="compact"] .sub,
.site-card[data-layout="other"][data-density="compact"] .sub {
  font-size: 11px;
  opacity: 0.70;
}

/* tiny：更紧凑 */
.site-card[data-layout="2x1"][data-density="tiny"] .card-inner,
.site-card[data-layout="3x1"][data-density="tiny"] .card-inner,
.site-card[data-layout="other"][data-density="tiny"] .card-inner {
  gap: 10px;
  padding: 10px 10px;
}

.site-card[data-layout="2x1"][data-density="tiny"] .title,
.site-card[data-layout="3x1"][data-density="tiny"] .title,
.site-card[data-layout="other"][data-density="tiny"] .title {
  font-size: 12.5px;
}

.site-card[data-layout="2x1"][data-density="tiny"] .row2,
.site-card[data-layout="3x1"][data-density="tiny"] .row2,
.site-card[data-layout="other"][data-density="tiny"] .row2 {
  font-size: 11px;
  opacity: 0.70;
}

.site-card[data-layout="2x1"][data-density="tiny"] .sub,
.site-card[data-layout="3x1"][data-density="tiny"] .sub,
.site-card[data-layout="other"][data-density="tiny"] .sub {
  font-size: 11px;
  opacity: 0.66;
}

.site-card[data-layout="2x1"][data-density="tiny"] .dot,
.site-card[data-layout="3x1"][data-density="tiny"] .dot,
.site-card[data-layout="other"][data-density="tiny"] .dot {
  display: none;
}
</style>
