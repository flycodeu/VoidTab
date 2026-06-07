<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {PhArrowClockwise, PhGlobeHemisphereEast, PhWarningCircle} from '@phosphor-icons/vue';
import IpInfoDetailModal from './IpInfoDetailModal.vue';
import {fetchIpInfo, type IpInfo} from './ipInfoData';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();

const info = ref<IpInfo | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const showModal = ref(false);

const layout = computed(() => {
  const w = Number(props.item.w || 2);
  const h = Number(props.item.h || 2);
  const isMini = w === 1 && h === 1;
  const isWide = w >= 2 && h === 1;
  const isTall = w === 1 && h >= 2;
  return {
    isMini,
    isWide,
    isTall,
    key: isMini ? 'mini' : isWide ? 'wide' : isTall ? 'tall' : 'standard',
  };
});

const locationText = computed(() => {
  const parts = [info.value?.country, info.value?.city].filter(Boolean);
  return parts.join(' · ') || '未知位置';
});

const loadInfo = async (force = false) => {
  loading.value = true;
  errorMessage.value = '';
  try {
    info.value = await fetchIpInfo(force);
  } catch {
    errorMessage.value = 'IP 查询暂时不可用';
  } finally {
    loading.value = false;
  }
};

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};

onMounted(() => loadInfo(false));
</script>

<template>
  <div
      class="ip-widget w-full h-full rounded-[18px] overflow-hidden cursor-pointer select-none"
      :data-layout="layout.key"
      @click="openModal"
  >
    <div v-if="loading && !info" class="ip-center">
      <PhGlobeHemisphereEast size="26" class="animate-pulse"/>
      <span v-if="!layout.isMini">查询中</span>
    </div>

    <div v-else-if="errorMessage && !info" class="ip-center text-center">
      <PhWarningCircle size="24" class="text-amber-200"/>
      <span v-if="!layout.isMini">{{ errorMessage }}</span>
      <button v-if="!layout.isMini" class="ip-refresh" @click.stop="loadInfo(true)">
        <PhArrowClockwise size="13" weight="bold"/>
        重试
      </button>
    </div>

    <div v-else-if="layout.isMini" class="ip-center">
      <PhGlobeHemisphereEast size="28" weight="duotone"/>
      <span>IP</span>
    </div>

    <div v-else-if="layout.isWide" class="ip-wide">
      <div class="ip-mark">
        <PhGlobeHemisphereEast size="18" weight="fill"/>
      </div>
      <div class="min-w-0 flex-1">
        <div class="ip-address truncate">{{ info?.ip || '--' }}</div>
        <div class="ip-sub truncate">{{ locationText }}</div>
      </div>
      <button class="ip-icon-btn" title="刷新 IP 信息" aria-label="刷新 IP 信息" @click.stop="loadInfo(true)">
        <PhArrowClockwise size="15" weight="bold" :class="{ 'animate-spin': loading }"/>
      </button>
    </div>

    <div v-else class="ip-standard">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <div class="ip-mark">
            <PhGlobeHemisphereEast size="18" weight="fill"/>
          </div>
          <div class="min-w-0">
            <div class="ip-label">当前 IP</div>
            <div class="ip-address truncate">{{ info?.ip || '--' }}</div>
          </div>
        </div>
        <button class="ip-icon-btn" title="刷新 IP 信息" aria-label="刷新 IP 信息" @click.stop="loadInfo(true)">
          <PhArrowClockwise size="15" weight="bold" :class="{ 'animate-spin': loading }"/>
        </button>
      </div>

      <div class="ip-detail-grid">
        <div>
          <span>位置</span>
          <strong class="truncate">{{ locationText }}</strong>
        </div>
        <div v-if="!layout.isTall">
          <span>网络</span>
          <strong class="truncate">{{ info?.isp || info?.asn || '--' }}</strong>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <IpInfoDetailModal
          v-if="showModal"
          :show="showModal"
          :info="info"
          :loading="loading"
          :error-message="errorMessage"
          @close="showModal = false"
          @refresh="loadInfo(true)"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.ip-widget {
  min-width: 0;
  min-height: 0;
  color: white;
  background:
      radial-gradient(circle at 86% 12%, rgba(45, 212, 191, 0.20), transparent 36%),
      linear-gradient(145deg, #0f2b46, #111827);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.24);
}

.ip-center {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 900;
}

.ip-wide,
.ip-standard {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ip-wide {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.ip-standard {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  padding: 13px;
}

.ip-mark {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.11);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.ip-label,
.ip-sub,
.ip-detail-grid span {
  color: rgba(255, 255, 255, 0.54);
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
}

.ip-address {
  margin-top: 4px;
  color: white;
  font-size: 14px;
  line-height: 1.05;
  font-weight: 950;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.ip-sub {
  margin-top: 5px;
}

.ip-icon-btn,
.ip-refresh {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.78);
}

.ip-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 10px;
}

.ip-refresh {
  gap: 5px;
  border-radius: 9px;
  padding: 6px 9px;
  font-size: 11px;
  font-weight: 900;
}

.ip-detail-grid {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.ip-detail-grid div {
  min-width: 0;
  display: grid;
  gap: 5px;
  border-radius: 12px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.075);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ip-detail-grid strong {
  min-width: 0;
  color: rgba(255, 255, 255, 0.90);
  font-size: 12px;
  line-height: 1.1;
}

.ip-widget[data-layout="tall"] .ip-standard {
  text-align: center;
  align-items: center;
}
</style>
