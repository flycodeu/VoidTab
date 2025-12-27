<script setup lang="ts">
import {computed} from 'vue';
import {PhWarningCircle} from '@phosphor-icons/vue';
import {getWidgetComponent} from '../../../core/widget/registry.ts';

const props = defineProps<{
  widget: any; // 你目前 widgets 结构是 any，这里不强行改类型
}>();

const colSpanClass = computed(() => {
  const span = Number(props.widget?.colSpan ?? 1);
  if (span >= 3) return 'lg:col-span-3';
  if (span === 2) return 'lg:col-span-2';
  return 'lg:col-span-1';
});

const Comp = computed(() => getWidgetComponent(String(props.widget?.id ?? '')));
</script>

<template>
  <div
      class="w-full h-[400px] flex flex-col rounded-3xl transition-all duration-300 relative group hover:-translate-y-1 hover:shadow-xl"
      :class="colSpanClass"
  >
    <!-- ✅ 已注册组件 -->
    <component
        v-if="Comp"
        :is="Comp"
        :settings="widget.config"
        class="w-full flex-1 shadow-sm"
    />

    <!-- ✅ unknown 兜底 -->
    <div
        v-else
        class="w-full flex-1 rounded-3xl border border-white/10 bg-white/5 flex flex-col items-center justify-center text-center p-6"
    >
      <PhWarningCircle size="40" weight="duotone" class="opacity-60 mb-4"/>
      <div class="text-sm font-bold opacity-80 mb-1">未注册的小组件</div>
      <div class="text-xs opacity-50 leading-relaxed">
        ID: <span class="font-mono">{{ widget.id }}</span><br/>
        请在 <span class="font-mono">core/widgets/registry.ts</span> 注册
      </div>
    </div>
  </div>
</template>
