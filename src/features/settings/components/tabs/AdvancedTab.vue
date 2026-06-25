<script setup lang="ts">
import {computed} from 'vue';
import {PhFlask, PhWarning} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';

const store = useConfigStore();

const sandboxEnabled = computed({
  get: () => store.config.runtime?.sandbox?.enabled === true,
  set: (value: boolean) => store.setSandboxRuntimeEnabled(value),
});
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <section class="p-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--modal-input-bg)] space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 font-extrabold text-sm">
            <PhFlask size="20" weight="duotone"/>
            Sandbox JS 本地实验
          </div>
          <p class="text-[11px] opacity-60 leading-relaxed mt-1">
            开启后，本机导入的沙箱 JS 组件会在隔离 iframe 中运行；该开关不会随 WebDAV 同步。
          </p>
        </div>
        <input
            v-model="sandboxEnabled"
            type="checkbox"
            class="w-5 h-5 shrink-0 accent-[var(--accent-color)]"
            aria-label="启用 Sandbox JS 本地实验"
        />
      </div>

      <div class="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2 text-[11px] leading-relaxed">
        <PhWarning size="17" weight="fill" class="shrink-0 text-amber-500 mt-0.5"/>
        <p class="opacity-75">
          Sandbox 组件不能访问主页面 DOM、扩展 API、隐私空间、AI Key 或 WebDAV 凭证。它仍然是高级实验能力，只建议运行自己信任的本地包。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
