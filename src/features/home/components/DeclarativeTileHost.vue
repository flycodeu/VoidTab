<script setup lang="ts">
import {computed, ref} from 'vue';
import type {ComponentTile, DeclarativeAction, DeclarativeTileDefinition} from '../../../core/tiles/contracts.ts';
import {createDeclarativeDataContext, normalizeDeclarativeUrl, resolveDeclarativeText} from '../../../core/tiles/declarativeData.ts';
import DeclarativeViewNode from './DeclarativeViewNode.vue';

const props = defineProps<{
  tile: ComponentTile;
  definition: DeclarativeTileDefinition;
}>();

const activeDialogView = ref('');

const dataContext = computed(() => createDeclarativeDataContext(props.tile));
const coverNode = computed(() => props.definition.views[props.definition.renderer.coverView]);
const dialogNode = computed(() => {
  const view = activeDialogView.value || props.definition.renderer.dialogView || '';
  return view ? props.definition.views[view] : null;
});
const dialogTitle = computed(() => {
  const node = dialogNode.value;
  if (!node || node.type !== 'dialog') return props.definition.label;
  return resolveDeclarativeText(node.title, dataContext.value) || props.definition.label;
});

const handleAction = (action: DeclarativeAction) => {
  if (action.type === 'openUrl') {
    const url = normalizeDeclarativeUrl(resolveDeclarativeText(action.url, dataContext.value));
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action.type === 'dialog') {
    activeDialogView.value = action.view || props.definition.renderer.dialogView || '';
  }
};
</script>

<template>
  <article class="decl-tile w-full h-full min-w-0 min-h-0" :data-package="definition.id">
    <DeclarativeViewNode
        v-if="coverNode"
        :node="coverNode"
        :context="dataContext"
        @action="handleAction"
    />
    <div v-else class="decl-empty">
      <strong>{{ definition.label }}</strong>
      <span>缺少声明式 coverView，实例数据已保留。</span>
    </div>

    <div v-if="dialogNode" class="decl-dialog-backdrop" @click.self="activeDialogView = ''">
      <section class="decl-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
        <div class="decl-dialog-head">
          <strong>{{ dialogTitle }}</strong>
          <button type="button" class="decl-dialog-close" aria-label="关闭" @click="activeDialogView = ''">×</button>
        </div>
        <div class="decl-dialog-body">
          <DeclarativeViewNode
              :node="dialogNode"
              :context="dataContext"
              @action="handleAction"
          />
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.decl-tile {
  position: relative;
  container-type: size;
  display: grid;
  align-content: stretch;
  padding: clamp(10px, 5cqi, 18px);
  overflow: hidden;
  border-radius: var(--tile-radius, 18px);
  color: var(--text-primary);
  background:
      linear-gradient(135deg, color-mix(in srgb, var(--tile-surface) 34%, transparent), transparent),
      radial-gradient(circle at top right, color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 20%, transparent), transparent 44%),
      rgba(var(--overlay-rgb), 0.11);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  box-shadow:
      0 calc(var(--tile-elevation, 1) * 8px) calc(var(--tile-elevation, 1) * 18px) rgba(15, 23, 42, 0.13);
}

.decl-empty {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  opacity: 0.72;
}

.decl-empty strong {
  color: var(--tile-accent-color, var(--accent-color));
}

.decl-empty span {
  font-size: 11px;
  line-height: 1.35;
}

.decl-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.decl-dialog {
  width: min(100%, 360px);
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--tile-radius, 18px) + 2px);
  border: 1px solid rgba(var(--overlay-rgb), 0.24);
  background: color-mix(in srgb, var(--modal-bg, #101014) 92%, transparent);
  color: var(--modal-text, var(--text-primary));
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.32);
}

.decl-dialog-head {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--overlay-rgb), 0.14);
}

.decl-dialog-close {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  background: rgba(var(--overlay-rgb), 0.10);
}

.decl-dialog-body {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}
</style>
