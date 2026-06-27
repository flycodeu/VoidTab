<script setup lang="ts">
import {PhCode, PhX} from '@phosphor-icons/vue';
import {useEscapeClose} from '../../../shared/composables/useEscapeClose';
import DesignerTab from '../../settings/components/tabs/DesignerTab.vue';

const props = defineProps<{show: boolean}>();
const emit = defineEmits(['close']);

useEscapeClose(() => props.show, () => emit('close'));
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[120] flex items-stretch justify-center p-0 sm:p-4 md:p-8">
      <div class="absolute inset-0 bg-black/55 backdrop-blur-md" @click="emit('close')"></div>

      <section
          class="relative w-full max-w-6xl h-full sm:h-[92vh] flex flex-col overflow-hidden rounded-none sm:rounded-2xl shadow-2xl border bg-[var(--settings-surface)] text-[var(--settings-text)]"
          style="border-color: var(--settings-border);"
          role="dialog"
          aria-modal="true"
          aria-labelledby="designer-modal-title"
          data-modal="1"
      >
        <header class="dm-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="dm-icon"><PhCode size="20" weight="fill"/></div>
            <div class="min-w-0">
              <h2 id="designer-modal-title" class="font-extrabold text-sm tracking-wide truncate">组件设计</h2>
              <p class="text-xs opacity-60 mt-0.5 truncate">独立的全屏设计器，适合编写代码与实时调试</p>
            </div>
          </div>
          <button type="button" class="dm-close" aria-label="关闭组件设计" title="关闭 (Esc)" @click="emit('close')">
            <PhX size="22"/>
          </button>
        </header>

        <div class="dm-body">
          <DesignerTab/>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.dm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--settings-border);
  background: var(--settings-panel);
}

.dm-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--accent-color-rgb), 0.14);
  color: var(--accent-color);
}

.dm-close {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.68;
  transition: opacity 0.16s ease, background 0.16s ease;
}

.dm-close:hover { opacity: 1; background: var(--settings-input-bg); }

.dm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 28px;
}
</style>
