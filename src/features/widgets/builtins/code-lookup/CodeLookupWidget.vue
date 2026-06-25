<script setup lang="ts">
import {computed, ref} from 'vue';
import type {SiteItem} from '../../../../core/config/types';
import {PhIdentificationCard, PhMagnifyingGlass} from '@phosphor-icons/vue';
import CodeLookupModal from './CodeLookupModal.vue';
import {getTypeLabel, searchGeoCodes} from './geoCodes';
import ToolWidgetState from '../../components/ToolWidgetState.vue';
import {useTileSizeContext} from '../../../../core/tiles/context.ts';

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>();
const tileSize = useTileSizeContext(() => ({w: Number(props.item.w || 2), h: Number(props.item.h || 2)}));

const showModal = ref(false);
const query = ref('');
const results = computed(() => searchGeoCodes(query.value || 'CN', 3));

const layout = computed(() => {
  const {w, h} = tileSize.value.placement;
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

const openModal = () => {
  if (props.isEditMode) return;
  showModal.value = true;
};
</script>

<template>
  <div
      class="lookup-widget w-full h-full rounded-[18px] overflow-hidden cursor-pointer select-none"
      :data-layout="layout.key"
      @click="openModal"
  >
    <div v-if="layout.isMini" class="lookup-mini">
      <PhIdentificationCard size="28" weight="duotone"/>
      <span>CODE</span>
    </div>

    <div v-else class="lookup-body">
      <div class="lookup-head">
        <div class="lookup-mark">
          <PhIdentificationCard size="18" weight="fill"/>
        </div>
        <div class="min-w-0">
          <div class="lookup-title">编码速查</div>
          <div class="lookup-sub">国家 · 城市 · 电话 · 语言</div>
        </div>
      </div>

      <div v-if="!layout.isTall" class="lookup-search" @click.stop>
        <PhMagnifyingGlass size="13"/>
        <input v-model="query" placeholder="CN / 北京 / +86" @focus="showModal = true">
      </div>

      <div class="lookup-results">
        <ToolWidgetState
            v-if="results.length === 0"
            type="empty"
            compact
            title="没有匹配编码"
            description="换一个国家、城市、电话区号或语言关键字"
        />
        <template v-else>
          <div v-for="record in results.slice(0, layout.isWide ? 1 : 2)" :key="record.id" class="lookup-row">
            <div class="min-w-0">
              <div class="lookup-row-title truncate">{{ record.zh }} · {{ record.en }}</div>
              <div class="lookup-row-sub truncate">{{ record.countryZh || getTypeLabel(record.type) }}</div>
            </div>
            <div class="lookup-code truncate">{{ record.code }}</div>
          </div>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <CodeLookupModal
          v-if="showModal"
          :show="showModal"
          :initial-query="query"
          @close="showModal = false"
          @update:query="query = $event"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.lookup-widget {
  min-width: 0;
  min-height: 0;
  color: white;
  background:
      radial-gradient(circle at 92% 10%, rgba(56, 189, 248, 0.20), transparent 34%),
      linear-gradient(145deg, #172033, #0f172a);
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.24);
}

.lookup-mini {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 10px;
  font-weight: 900;
}

.lookup-body {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
}

.lookup-head {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex-shrink: 0;
}

.lookup-mark {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.lookup-title {
  font-size: 13px;
  line-height: 1.1;
  font-weight: 950;
}

.lookup-sub {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.54);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.lookup-search {
  height: 30px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
  padding: 0 9px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.54);
}

.lookup-search input {
  min-width: 0;
  flex: 1;
  outline: none;
  background: transparent;
  color: white;
  font-size: 11px;
  font-weight: 800;
}

.lookup-results {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 7px;
  align-content: start;
}

.lookup-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.065);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.lookup-row-title {
  font-size: 11px;
  line-height: 1.1;
  font-weight: 900;
}

.lookup-row-sub {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 10px;
  line-height: 1;
}

.lookup-code {
  max-width: 80px;
  border-radius: 8px;
  padding: 5px 7px;
  color: #bae6fd;
  background: rgba(14, 165, 233, 0.12);
  border: 1px solid rgba(14, 165, 233, 0.18);
  font-size: 10px;
  line-height: 1;
  font-family: 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 900;
}

.lookup-widget[data-layout="wide"] .lookup-body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.lookup-widget[data-layout="wide"] .lookup-sub {
  display: none;
}

.lookup-widget[data-layout="wide"] .lookup-results {
  display: block;
}

.lookup-widget[data-layout="tall"] .lookup-body {
  align-items: center;
  text-align: center;
}

.lookup-widget[data-layout="tall"] .lookup-row {
  grid-template-columns: 1fr;
}
</style>
