<script setup lang="ts">
import {ref, computed} from 'vue';
import {
  PhX, PhCoin, PhCalendarCheck, PhCalculator,
  PhSmiley, PhMoney
} from '@phosphor-icons/vue';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{
  show: boolean;
  config: { baseSalary: number; payDay: number; currency: string };
  calculation: any;
}>();

const emit = defineEmits(['close', 'save']);
useEscapeClose(() => props.show, () => emit('close'));

// 本地编辑状态
const editConfig = ref({...props.config});

const save = () => {
  emit('save', editConfig.value);
  emit('close');
};

// 趣味计算
const funStats = computed(() => {
  const salary = editConfig.value.baseSalary;
  const workDays = 21.75; // 平均月工作日
  const workHours = 8;

  return [
    {label: '日薪', val: (salary / workDays).toFixed(0)},
    {label: '时薪', val: (salary / workDays / workHours).toFixed(0)},
    {label: '摸鱼10分钟', val: (salary / workDays / workHours / 60 * 10).toFixed(1)},
  ];
});
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/20 backdrop-blur-sm" @click="emit('close')"></div>

      <div
          class="relative bg-[#fffcfc] dark:bg-[#1a1a1a] w-[400px] rounded-[32px] shadow-2xl overflow-hidden border border-rose-100 dark:border-white/5 flex flex-col">

        <div
            class="h-28 bg-gradient-to-br from-rose-300 to-pink-400 relative flex items-center justify-center overflow-hidden shrink-0">
          <PhSmiley weight="duotone" class="text-white/20 absolute -bottom-6 -left-6 rotate-12" size="140"/>
          <PhCoin weight="duotone" class="text-yellow-200 absolute top-4 right-8 animate-bounce" size="32"/>

          <div class="text-center z-10 text-white">
            <div class="text-xs font-bold opacity-80 uppercase tracking-widest mb-1">Current Status</div>
            <div class="text-3xl font-black tracking-tight">
              {{ calculation.isPayDay ? '发工资啦! 🎉' : `搬砖第 ${Math.floor(calculation.progress)}% 天` }}
            </div>
          </div>

          <button @click="emit('close')"
                  class="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 text-white rounded-full transition-colors">
            <PhX size="18" weight="bold"/>
          </button>
        </div>

        <div
            class="p-6 flex flex-col gap-6 text-[#5d3a3a] dark:text-white/90 overflow-y-auto max-h-[60vh] custom-scrollbar">

          <div class="grid grid-cols-3 gap-3">
            <div v-for="stat in funStats" :key="stat.label"
                 class="bg-rose-50 dark:bg-white/5 p-3 rounded-2xl flex flex-col items-center justify-center text-center border border-rose-100 dark:border-white/5">
              <span class="text-[10px] opacity-60 font-bold mb-1">{{ stat.label }}</span>
              <span class="text-lg font-black text-rose-500">{{ props.config.currency }}{{ stat.val }}</span>
            </div>
          </div>

          <div class="space-y-4">
            <div class="flex items-center gap-2 text-sm font-bold opacity-50 uppercase tracking-wide">
              <PhCalculator size="16"/>
              基础设置
            </div>

            <div class="space-y-3">
              <div
                  class="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-1.5 flex items-center shadow-sm focus-within:ring-2 ring-rose-200 transition-all">
                <div
                    class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                  <PhMoney weight="bold" size="20"/>
                </div>
                <div class="flex-1 px-3 flex flex-col justify-center">
                  <span class="text-[10px] opacity-50 font-bold">月薪 (税后)</span>
                  <input
                      v-model.number="editConfig.baseSalary"
                      type="number"
                      class="w-full bg-transparent border-none outline-none p-0 text-sm font-bold h-5 text-[#5d3a3a] dark:text-white"
                  >
                </div>
              </div>

              <div
                  class="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-1.5 flex items-center shadow-sm focus-within:ring-2 ring-rose-200 transition-all">
                <div
                    class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                  <PhCalendarCheck weight="bold" size="20"/>
                </div>
                <div class="flex-1 px-3 flex flex-col justify-center">
                  <span class="text-[10px] opacity-50 font-bold">每月发薪日</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold">每月</span>
                    <input
                        v-model.number="editConfig.payDay"
                        type="number"
                        min="1" max="31"
                        class="w-12 bg-transparent border-b border-gray-200 dark:border-white/20 outline-none text-center text-sm font-bold text-[#5d3a3a] dark:text-white"
                    >
                    <span class="text-xs font-bold">号</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div class="p-4 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20">
          <button
              @click="save"
              class="w-full py-3.5 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold shadow-lg shadow-rose-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            保存设定
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #fecdd3;
  border-radius: 4px;
}
</style>
