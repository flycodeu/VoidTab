<script setup lang="ts">
import {computed, ref, watch, onMounted, onUnmounted, nextTick} from "vue";
import {useConfigStore} from "../../../stores/useConfigStore.ts";
import {useUiStore} from "../../../stores/ui/useUiStore.ts";
import type {SiteItem, BookmarkDensity} from "../../../core/config/types.ts";
import SiteIcon from "./SiteIcon.vue";
import {markSiteIconMiss, resolveAndCacheSiteIcon} from "../../../shared/utils/siteIconCache.ts";
import {getDirectIconFallbackUrl, getInstantAutoIconUrl} from "../../../shared/utils/icon.ts";

const store = useConfigStore();
const ui = useUiStore();

const props = defineProps<{
  item: SiteItem;
  isEditMode?: boolean;
  density?: BookmarkDensity;
  cardSpanW?: number;
  cardSpanH?: number;
  priority?: 'high' | 'low';
}>();

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
const directIconErrorUrl = ref("");
const iconSourceMode = ref<"auto" | "none">("none");
const autoIconLowQuality = ref(false);
let deferredResolveTimer: ReturnType<typeof setTimeout> | null = null;
let deferredResolveAttempts = 0;
let scheduledResolveTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledResolveIdleId: number | null = null;
const CARD_ICON_STARTUP_WINDOW_MS = 4500;
const cardCreatedAt = globalThis.performance?.now ? globalThis.performance.now() : Date.now();
const iconNow = () => globalThis.performance?.now ? globalThis.performance.now() : Date.now();
const isStartupIconWindow = () => iconNow() - cardCreatedAt < CARD_ICON_STARTUP_WINDOW_MS;

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

const clearDeferredResolveTimer = () => {
  if (!deferredResolveTimer) return;
  clearTimeout(deferredResolveTimer);
  deferredResolveTimer = null;
};

const clearScheduledResolve = () => {
  if (scheduledResolveTimer) {
    clearTimeout(scheduledResolveTimer);
    scheduledResolveTimer = null;
  }
  if (scheduledResolveIdleId !== null && typeof window !== "undefined") {
    const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
    if (cancelIdle) cancelIdle(scheduledResolveIdleId);
    scheduledResolveIdleId = null;
  }
};

const directIconUrl = computed(() => {
  return getDirectIconFallbackUrl(props.item.icon, props.item.iconValue, props.item.url);
});

const canUseDirectIconUrl = () => {
  const direct = directIconUrl.value;
  return !!direct && direct !== directIconErrorUrl.value;
};

const scheduleDeferredResolveRetry = (token: number) => {
  if (deferredResolveAttempts >= 2) return;
  deferredResolveAttempts += 1;
  clearDeferredResolveTimer();
  deferredResolveTimer = setTimeout(() => {
    deferredResolveTimer = null;
    if (token !== resolveToken.value || !isAuto.value || autoIconUrl.value) return;
    void resolveAutoIcon(false);
  }, 1800 * deferredResolveAttempts);
};

const applyInstantAutoIcon = () => {
  if (!isAuto.value || !props.item.url || autoIconUrl.value) return;
  const instantUrl = getInstantAutoIconUrl(props.item.url, props.item.icon, props.item.iconValue);
  if (!instantUrl || instantUrl === directIconErrorUrl.value) return;
  hasLoadError.value = false;
  iconSourceMode.value = "auto";
  autoIconLowQuality.value = false;
  setAutoIconUrl(instantUrl, false);
};

const scheduleAutoIconResolve = (forceRefresh = false) => {
  clearScheduledResolve();
  if (forceRefresh) {
    void resolveAutoIcon(true);
    return;
  }

  const startup = isStartupIconWindow();
  const delayMs = props.priority === "low"
      ? (startup ? 1600 : 700)
      : (startup ? 350 : 80);

  scheduledResolveTimer = setTimeout(() => {
    scheduledResolveTimer = null;
    const run = () => {
      scheduledResolveIdleId = null;
      void resolveAutoIcon(false);
    };

    if (typeof window === "undefined") {
      run();
      return;
    }

    const requestIdle = (window as any).requestIdleCallback as undefined | ((cb: () => void, options?: {timeout: number}) => number);
    if (requestIdle) {
      scheduledResolveIdleId = requestIdle(run, {timeout: props.priority === "low" ? 2600 : 1200});
    } else {
      scheduledResolveTimer = setTimeout(run, props.priority === "low" ? 700 : 0);
    }
  }, delayMs);
};

const resolveAutoIcon = async (forceRefresh = false) => {
  if (!isAuto.value) {
    setAutoIconUrl("", false);
    iconSourceMode.value = "none";
    autoIconLowQuality.value = false;
    return;
  }

  if (!props.item.url) {
    setAutoIconUrl("", false);
    iconSourceMode.value = "none";
    autoIconLowQuality.value = false;
    hasLoadError.value = true;
    return;
  }

  const token = ++resolveToken.value;
  if (!forceRefresh && !autoIconUrl.value) {
    applyInstantAutoIcon();
  }

  const result = await resolveAndCacheSiteIcon(props.item.url, store.config.runtime, {
    forceRefresh,
    fastFirst: true,
    fastTimeoutMs: 900,
    timeoutMs: 1400,
  });

  if (token !== resolveToken.value) {
    if (result?.objectUrl && result.url.startsWith("blob:")) URL.revokeObjectURL(result.url);
    return;
  }

  if (!result?.url) {
    if (canUseDirectIconUrl()) {
      iconSourceMode.value = "auto";
      autoIconLowQuality.value = false;
      setAutoIconUrl(directIconUrl.value, false);
      hasLoadError.value = false;
    } else {
      iconSourceMode.value = "none";
      autoIconLowQuality.value = false;
      setAutoIconUrl("", false);
      hasLoadError.value = true;
    }
    if (!forceRefresh) scheduleDeferredResolveRetry(token);
    return;
  }

  clearDeferredResolveTimer();
  hasLoadError.value = false;
  iconSourceMode.value = "auto";
  autoIconLowQuality.value = !!result.lowQuality;
  setAutoIconUrl(result.url, !!result.objectUrl);
};

watch(
    () => [props.item.url, props.item.iconType, props.item.icon, props.item.iconValue],
    () => {
      hasLoadError.value = false;
      hasTriedForceRefresh.value = false;
      directIconErrorUrl.value = "";
      autoIconLowQuality.value = false;
      deferredResolveAttempts = 0;
      clearDeferredResolveTimer();
      clearScheduledResolve();
      applyInstantAutoIcon();
      scheduleAutoIconResolve(false);
    },
    {immediate: true}
);

const getFallbackText = () => {
  const iconText = String(props.item.iconValue || "").trim();
  if (normalizedIconType.value === "text" && iconText) return iconText.substring(0, 4);

  const title = String(props.item.title || "").trim();
  const source = title || domain.value || String(props.item.url || "").trim() || "A";
  if (/[\u4e00-\u9fa5]/.test(source)) return source.substring(0, 2);

  const clean = source.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
  return clean.substring(0, 4).toUpperCase() || source.substring(0, 2).toUpperCase() || "A";
};

const displayText = computed(() => {
  if (normalizedIconType.value === "icon") return "";
  return getFallbackText();
});

const handleFallback = () => {
  if (!isAuto.value) {
    hasLoadError.value = true;
    return;
  }

  if (directIconUrl.value && autoIconUrl.value === directIconUrl.value) {
    directIconErrorUrl.value = directIconUrl.value;
  }

  if (iconSourceMode.value === "auto" && props.item.url && !!autoIconUrl.value) {
    markSiteIconMiss(props.item.url, store.config.runtime, {error: "img_error", preserveExisting: true});
    if (!hasTriedForceRefresh.value) {
      hasTriedForceRefresh.value = true;
      clearScheduledResolve();
      void resolveAutoIcon(true);
      return;
    }
  }

  hasLoadError.value = true;
  autoIconLowQuality.value = false;
  setAutoIconUrl("", false);
};
const handleImgLoad = () => (hasLoadError.value = false);

const mode = computed(() => (store.config.theme as any).siteLayoutMode || "icon");

const cardCfg = computed(() => {
  const def = {showRemark: true, showDomain: true, w: 2, h: 1};
  return (store.config.theme as any).siteCard
      ? {...def, ...(store.config.theme as any).siteCard}
      : def;
});

const iconSize = computed(() => Number(store.config.theme.iconSize || 72));
const cardRadius = computed(() => Number(store.config.theme.radius || 16));

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

const labelH = computed(() => {
  if (!store.config.theme.showIconName) return 0;
  const textSize = Number(store.config.theme.iconTextSize || 12);
  return Math.max(18, Math.ceil(textSize * 1.35 + 6));
});

const iconContainerStyle = computed(() => ({
  width: `${iconSize.value}px`,
  height: `${iconSize.value}px`,
}));

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
  clearDeferredResolveTimer();
  clearScheduledResolve();
  revokeObjectUrl();
});

watch(
    () => [mode.value, cardCfg.value.w, cardCfg.value.h, cardSpanW.value, cardSpanH.value],
    () => {
      ensureObserveAndMeasure();
    }
);

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

const showDomainRow = computed(() => {
  if (!cardCfg.value.showDomain || !domain.value) return false;
  if (cardLayoutMode.value === "1x1") return false;
  if (densityMode.value === "tiny") return false;
  if (cardLayoutMode.value === "2x1" && densityMode.value === "compact") return false;
  return true;
});
</script>

<template>
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
        <div class="card-left">
          <SiteIcon
              :item="item"
              :size="cardIconSize"
              :radius="cardIconRadius"
              :isAuto="isAuto"
              :autoIconUrl="autoIconUrl"
              :hasError="hasLoadError"
              :lowQuality="autoIconLowQuality"
              :text="displayText"
              :textFontSize="cardTextFontSize"
              :density="density"
              :priority="priority"
              @loaded="handleImgLoad"
              @fallback="handleFallback"
          />
        </div>

        <div class="card-right min-w-0">
          <div class="row row1 min-w-0">
            <div class="title truncate">
              {{ item.title || "未命名" }}
            </div>
            <div v-if="showDot" class="dot" aria-hidden="true"></div>
          </div>

          <div v-if="showDomainRow" class="row row2 truncate">
            {{ domain }}
          </div>

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
          :lowQuality="autoIconLowQuality"
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
          :priority="priority"
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
  position: relative;
  height: 100%;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  border: 1px solid rgba(var(--overlay-rgb), 0.28);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18) inset,
  0 10px 22px rgba(15, 23, 42, 0.12);

  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.22), rgba(var(--overlay-rgb), 0.12)),
      rgba(var(--overlay-rgb), 0.10);

  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);

  transition: transform 0.18s ease,
  border-color 0.18s ease,
  box-shadow 0.18s ease,
  background 0.18s ease;
}

.card-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(var(--accent-color-rgb), 0.16), transparent 38%);
  opacity: 0.42;
}

.site-card:hover .card-shell {
  transform: translateY(-2px);
  border-color: rgba(var(--accent-color-rgb), 0.42);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.20) inset,
  0 0 0 1px rgba(var(--accent-color-rgb), 0.14),
  0 16px 34px rgba(15, 23, 42, 0.16),
  0 8px 22px rgba(var(--accent-color-rgb), 0.12);
  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.26), rgba(var(--overlay-rgb), 0.16)),
      rgba(var(--overlay-rgb), 0.12);
}

.card-inner {
  position: relative;
  z-index: 1;
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
  background: rgba(var(--accent-color-rgb), 0.72);
  border: 1px solid rgba(var(--accent-color-rgb), 0.24);
  box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.10);
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
