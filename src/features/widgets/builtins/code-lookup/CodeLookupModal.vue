<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhIdentificationCard, PhMagnifyingGlass, PhX} from '@phosphor-icons/vue';
import {geoCodeRecords, getTypeLabel, searchGeoCodes, type GeoCodeRecord} from './geoCodes';

const props = defineProps<{ show: boolean; initialQuery: string }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:query', value: string): void;
}>();

const query = ref(props.initialQuery || '');
const activeType = ref<'all' | GeoCodeRecord['type']>('all');

const typeOptions: Array<{ id: 'all' | GeoCodeRecord['type']; label: string }> = [
  {id: 'all', label: '全部'},
  {id: 'country', label: '国家'},
  {id: 'city', label: '城市'},
  {id: 'calling', label: '电话'},
  {id: 'locale', label: '语言'},
  {id: 'currency', label: '货币'},
];

const results = computed(() => {
  const base = query.value.trim() ? searchGeoCodes(query.value, 60) : geoCodeRecords;
  if (activeType.value === 'all') return base;
  return base.filter((record) => record.type === activeType.value);
});

watch(query, (value) => emit('update:query', value));
</script>

<template>
  <Transition name="lookup-modal">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-3 md:p-8">
      <div class="settings-mask absolute inset-0" @click="emit('close')"></div>

      <div class="settings-shell relative w-full max-w-4xl h-[82vh] rounded-[24px] overflow-hidden flex flex-col">
        <div class="settings-header shrink-0 px-5 py-4">
          <div class="flex items-center justify-between gap-4 mb-4">
            <div class="flex items-center gap-3 min-w-0">
              <div class="settings-logo p-2.5 rounded-xl shrink-0">
                <PhIdentificationCard size="22" weight="fill"/>
              </div>
              <div class="min-w-0">
                <h3 class="settings-text text-lg font-black truncate">编码速查器</h3>
                <p class="settings-muted text-[11px] font-bold truncate">国家、城市、电话区号、语言与货币编码</p>
              </div>
            </div>

            <button class="settings-close p-2.5 rounded-full shrink-0" @click="emit('close')">
              <PhX size="20"/>
            </button>
          </div>

          <div class="lookup-search">
            <PhMagnifyingGlass size="18"/>
            <input v-model="query" autofocus placeholder="输入 CN、+86、北京、Beijing、USD...">
          </div>

          <div class="type-tabs" data-wheel-allow="true">
            <button
                v-for="item in typeOptions"
                :key="item.id"
                type="button"
                class="type-tab"
                :class="activeType === item.id ? 'is-active' : ''"
                @click="activeType = item.id"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div class="settings-body flex-1 min-h-0 overflow-y-auto custom-scroll p-4 md:p-6" data-wheel-allow="true">
          <div class="lookup-grid">
            <div v-for="record in results" :key="record.id" class="lookup-card">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="record-title truncate">{{ record.zh }}</div>
                  <div class="record-en truncate">{{ record.en }}</div>
                </div>
                <div class="record-type">{{ getTypeLabel(record.type) }}</div>
              </div>

              <div class="record-code">{{ record.code }}</div>

              <div class="record-meta">
                <span v-if="record.countryZh">{{ record.countryZh }} / {{ record.countryEn }}</span>
                <span v-else>{{ getTypeLabel(record.type) }}</span>
                <span v-if="record.provinceZh">{{ record.provinceZh }}</span>
              </div>
            </div>
          </div>

          <div v-if="results.length === 0" class="empty-state">
            没有找到匹配编码
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.lookup-modal-enter-active,
.lookup-modal-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.lookup-modal-enter-from,
.lookup-modal-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.lookup-search {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--settings-input-bg);
  border: 1px solid var(--settings-border-soft);
  color: var(--settings-text-secondary);
}

.lookup-search input {
  min-width: 0;
  flex: 1;
  outline: none;
  background: transparent;
  color: var(--settings-text);
  font-size: 14px;
  font-weight: 800;
}

.type-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-top: 12px;
}

.type-tab {
  flex-shrink: 0;
  height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  background: var(--settings-input-bg);
  border: 1px solid var(--settings-border-soft);
  color: var(--settings-text-secondary);
  font-size: 12px;
  font-weight: 900;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.type-tab.is-active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.lookup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.lookup-card {
  min-width: 0;
  display: grid;
  gap: 12px;
  border-radius: 16px;
  padding: 14px;
  background: var(--settings-panel);
  border: 1px solid var(--settings-border);
  box-shadow: var(--settings-shadow-soft);
}

.record-title {
  color: var(--settings-text);
  font-size: 15px;
  line-height: 1.1;
  font-weight: 950;
}

.record-en {
  margin-top: 5px;
  color: var(--settings-text-secondary);
  font-size: 12px;
  line-height: 1.1;
  font-weight: 700;
}

.record-type {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 5px 8px;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.10);
  border: 1px solid rgba(var(--accent-color-rgb), 0.16);
  font-size: 11px;
  line-height: 1;
  font-weight: 900;
}

.record-code {
  overflow-wrap: anywhere;
  border-radius: 12px;
  padding: 10px;
  background: var(--settings-input-bg);
  border: 1px solid var(--settings-border-soft);
  color: var(--settings-text);
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 900;
}

.record-meta {
  display: grid;
  gap: 4px;
  color: var(--settings-text-secondary);
  font-size: 12px;
  line-height: 1.3;
}

.empty-state {
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-text-secondary);
  font-size: 13px;
  font-weight: 800;
}
</style>
