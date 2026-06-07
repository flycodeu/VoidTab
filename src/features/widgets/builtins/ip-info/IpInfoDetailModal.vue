<script setup lang="ts">
import {computed} from 'vue';
import {PhArrowClockwise, PhGlobeHemisphereEast, PhX} from '@phosphor-icons/vue';
import type {IpInfo} from './ipInfoData';

const props = defineProps<{
  show: boolean;
  info: IpInfo | null;
  loading: boolean;
  errorMessage: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'refresh'): void;
}>();

const fields = computed(() => [
  {label: '公网 IP', value: props.info?.ip || '--'},
  {label: '国家/地区', value: [props.info?.country, props.info?.countryCode].filter(Boolean).join(' / ') || '--'},
  {label: '城市', value: [props.info?.region, props.info?.city].filter(Boolean).join(' / ') || '--'},
  {label: '运营商', value: props.info?.isp || '--'},
  {label: 'ASN', value: props.info?.asn || '--'},
  {label: '时区', value: props.info?.timezone || '--'},
  {label: '数据源', value: props.info?.provider || '--'},
]);

const rawText = computed(() => {
  if (!props.info?.raw) return '';
  try {
    return JSON.stringify(props.info.raw, null, 2);
  } catch {
    return '';
  }
});
</script>

<template>
  <Transition name="ip-modal">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-3 md:p-8">
      <div class="settings-mask absolute inset-0" @click="emit('close')"></div>

      <div class="settings-shell relative w-full max-w-3xl max-h-[84vh] rounded-[24px] overflow-hidden flex flex-col">
        <div class="settings-header shrink-0 px-5 py-4 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="settings-logo p-2.5 rounded-xl shrink-0">
              <PhGlobeHemisphereEast size="22" weight="fill"/>
            </div>
            <div class="min-w-0">
              <h3 class="settings-text text-lg font-black truncate">当前 IP 信息</h3>
              <p class="settings-muted text-[11px] font-bold truncate">{{ info?.ip || '尚未获取' }}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button class="settings-btn refresh-btn" @click="emit('refresh')">
              <PhArrowClockwise size="16" weight="bold" :class="{ 'animate-spin': loading }"/>
              <span>刷新</span>
            </button>
            <button class="settings-close p-2.5 rounded-full" @click="emit('close')">
              <PhX size="20"/>
            </button>
          </div>
        </div>

        <div class="settings-body flex-1 min-h-0 overflow-y-auto custom-scroll p-5" data-wheel-allow="true">
          <div v-if="errorMessage" class="ip-error">{{ errorMessage }}</div>

          <div class="field-grid">
            <div v-for="field in fields" :key="field.label" class="field-card">
              <span>{{ field.label }}</span>
              <strong>{{ field.value }}</strong>
            </div>
          </div>

          <div v-if="rawText" class="raw-panel">
            <div class="raw-title">Raw JSON</div>
            <pre>{{ rawText }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ip-modal-enter-active,
.ip-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ip-modal-enter-from,
.ip-modal-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.refresh-btn {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 900;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.field-card {
  min-width: 0;
  display: grid;
  gap: 8px;
  border-radius: 16px;
  padding: 14px;
  background: var(--settings-panel);
  border: 1px solid var(--settings-border);
  box-shadow: var(--settings-shadow-soft);
}

.field-card span,
.raw-title {
  color: var(--settings-text-secondary);
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-card strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--settings-text);
  font-size: 14px;
  line-height: 1.28;
  font-weight: 900;
}

.raw-panel {
  margin-top: 14px;
  border-radius: 16px;
  padding: 14px;
  background: var(--settings-panel);
  border: 1px solid var(--settings-border);
}

.raw-panel pre {
  margin-top: 10px;
  overflow: auto;
  max-height: 260px;
  color: var(--settings-text-secondary);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.ip-error {
  margin-bottom: 14px;
  border-radius: 14px;
  padding: 12px 14px;
  color: #fde68a;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.20);
  font-size: 12px;
  font-weight: 800;
}
</style>
