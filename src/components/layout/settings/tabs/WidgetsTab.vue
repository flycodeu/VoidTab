<script setup lang="ts">
import { useConfigStore } from '../../../../stores/useConfigStore';
import { PhPuzzlePiece } from '@phosphor-icons/vue';

const store = useConfigStore();
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)]">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-sm opacity-60">组件管理</h3>
      </div>

      <div class="grid gap-3">
        <div
            v-for="widget in store.config.widgets"
            :key="widget.id"
            class="flex items-center justify-between p-4 rounded-xl border border-[var(--glass-border)] bg-white/5"
        >
          <div class="flex items-center gap-3">
            <PhPuzzlePiece size="20" class="opacity-50"/>
            <div class="flex flex-col">
              <span class="font-bold text-sm">{{ widget.name }}</span>
              <span class="text-[10px] opacity-40">ID: {{ widget.id }}</span>
            </div>
          </div>
          <input type="checkbox" v-model="widget.visible" class="w-5 h-5 accent-[var(--accent-color)]"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
