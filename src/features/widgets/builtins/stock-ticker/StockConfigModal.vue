<script setup lang="ts">
import {ref} from 'vue';
import {PhX, PhPlus, PhTrash} from '@phosphor-icons/vue';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{
  show: boolean;
  config: any;
}>();

const emit = defineEmits(['close', 'save']);
useEscapeClose(() => props.show, () => emit('close'));

const localConfig = ref(JSON.parse(JSON.stringify(props.config)));
const newSymbol = ref('');

const addSymbol = () => {
  if (newSymbol.value) {
    localConfig.value.symbols.push(newSymbol.value.toUpperCase().trim());
    newSymbol.value = '';
  }
};

const removeSymbol = (index: number) => {
  localConfig.value.symbols.splice(index, 1);
};

const save = () => {
  emit('save', localConfig.value);
  emit('close');
};
</script>

<template>
  <Transition name="scale">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('close')"></div>

      <div
          class="relative bg-[#1a1a1a] w-[360px] max-w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl border border-white/10 shadow-2xl flex flex-col text-white">

        <div class="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h3 class="text-sm font-bold">看板设置</h3>
          <button @click="emit('close')" class="p-1 hover:bg-white/10 rounded-full">
            <PhX/>
          </button>
        </div>

        <div class="p-4 space-y-5">

          <div class="space-y-2">
            <label class="text-xs text-white/50 font-bold uppercase">颜色偏好</label>
            <div class="flex bg-black/20 p-1 rounded-lg">
              <button
                  @click="localConfig.colorMode = 'cn'"
                  class="flex-1 py-1.5 text-xs font-bold rounded-md transition-all"
                  :class="localConfig.colorMode === 'cn' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'"
              >
                <span class="text-red-500">红涨</span><span class="text-green-500">绿跌</span> (CN)
              </button>
              <button
                  @click="localConfig.colorMode = 'global'"
                  class="flex-1 py-1.5 text-xs font-bold rounded-md transition-all"
                  :class="localConfig.colorMode === 'global' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'"
              >
                <span class="text-green-500">绿涨</span><span class="text-red-500">红跌</span> (Global)
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-xs text-white/50 font-bold uppercase">关注列表 (公开 Chart Symbol)</label>

            <div class="flex gap-2">
              <input
                  v-model="newSymbol"
                  @keyup.enter="addSymbol"
                  type="text"
                  placeholder="例如: AAPL, MSFT, 0700.HK"
                  class="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[var(--accent-color)]"
              >
              <button @click="addSymbol" class="p-2 bg-white/10 hover:bg-white/20 rounded-lg">
                <PhPlus/>
              </button>
            </div>

            <div class="max-h-[150px] overflow-y-auto space-y-1 custom-scrollbar">
              <div v-for="(sym, idx) in localConfig.symbols" :key="idx"
                   class="flex justify-between items-center bg-white/5 px-3 py-2 rounded-lg text-xs group">
                <span class="font-mono">{{ sym }}</span>
                <button @click="removeSymbol(idx)"
                        class="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <PhTrash/>
                </button>
              </div>
            </div>
          </div>

        </div>

        <div class="p-4 border-t border-white/5">
          <button @click="save"
                  class="w-full py-2 bg-[var(--accent-color)] hover:opacity-90 text-white text-xs font-bold rounded-lg transition-all">
            保存更改
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scale-enter-active, .scale-leave-active {
  transition: all 0.2s ease;
}

.scale-enter-from, .scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
</style>
