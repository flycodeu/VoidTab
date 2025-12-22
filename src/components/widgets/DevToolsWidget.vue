<script setup lang="ts">
import { ref } from 'vue';
import { PhClock, PhBracketsCurly, PhTimer, PhKey, PhCopy} from '@phosphor-icons/vue';

defineProps<{ settings?: any }>();
const activeTab = ref<'timestamp' | 'json' | 'cron' | 'jwt'>('timestamp');

// --- 1. 时间戳转换 ---
const tsInput = ref<string>(Date.now().toString());
const tsDateStr = ref('');
const nowTimestamp = () => { tsInput.value = Date.now().toString(); convertTs(); };
const convertTs = () => {
  if (!tsInput.value) return;
  const ts = parseInt(tsInput.value);
  // 智能判断秒还是毫秒 (10位是秒，13位是毫秒)
  const date = tsInput.value.length === 10 ? new Date(ts * 1000) : new Date(ts);
  tsDateStr.value = date.toLocaleString() !== 'Invalid Date' ? date.toLocaleString() : '无效的时间戳';
};
// 初始化转换一次
convertTs();

// --- 2. JSON 格式化 ---
const jsonInput = ref('');
const jsonError = ref('');
const formatJson = () => {
  try {
    if (!jsonInput.value) return;
    const obj = JSON.parse(jsonInput.value);
    jsonInput.value = JSON.stringify(obj, null, 2);
    jsonError.value = '';
  } catch (e) {
    jsonError.value = '无效的 JSON 格式';
  }
};
const compressJson = () => {
  try {
    if (!jsonInput.value) return;
    const obj = JSON.parse(jsonInput.value);
    jsonInput.value = JSON.stringify(obj);
    jsonError.value = '';
  } catch (e) {
    jsonError.value = '无效的 JSON 格式';
  }
};

// --- 3. Cron 表达式 (常用预设) ---
const cronInput = ref('* * * * *');
const cronPresets = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天午夜', value: '0 0 * * *' },
  { label: '每周一早8点', value: '0 8 * * 1' },
  { label: '每月1号', value: '0 0 1 * *' },
];
const copyCron = () => { navigator.clipboard.writeText(cronInput.value); alert('已复制 Cron'); };

// --- 4. JWT 解码 ---
const jwtInput = ref('');
const jwtHeader = ref('');
const jwtPayload = ref('');
const decodeJwt = () => {
  try {
    if (!jwtInput.value.includes('.')) { jwtPayload.value = '无效的 Token'; return; }
    const parts = jwtInput.value.split('.');

    // Header
    jwtHeader.value = JSON.stringify(JSON.parse(atob(parts[0])), null, 2);
    // Payload
    jwtPayload.value = JSON.stringify(JSON.parse(atob(parts[1])), null, 2);
  } catch (e) {
    jwtPayload.value = '解码失败，请检查 Token 格式';
    jwtHeader.value = '';
  }
};
</script>

<template>
  <div class="h-full flex flex-col font-sans text-gray-700">
    <div class="flex items-center gap-2 mb-4 border-b border-gray-100 pb-2 overflow-x-auto no-scrollbar">
      <button @click="activeTab = 'timestamp'" class="p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold whitespace-nowrap" :class="activeTab === 'timestamp' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-400'">
        <PhClock size="16" weight="bold"/> 时间戳
      </button>
      <button @click="activeTab = 'cron'" class="p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold whitespace-nowrap" :class="activeTab === 'cron' ? 'bg-orange-50 text-orange-600' : 'hover:bg-gray-100 text-gray-400'">
        <PhTimer size="16" weight="bold"/> Cron
      </button>
      <button @click="activeTab = 'json'" class="p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold whitespace-nowrap" :class="activeTab === 'json' ? 'bg-green-50 text-green-600' : 'hover:bg-gray-100 text-gray-400'">
        <PhBracketsCurly size="16" weight="bold"/> JSON
      </button>
      <button @click="activeTab = 'jwt'" class="p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold whitespace-nowrap" :class="activeTab === 'jwt' ? 'bg-purple-50 text-purple-600' : 'hover:bg-gray-100 text-gray-400'">
        <PhKey size="16" weight="bold"/> JWT
      </button>
    </div>

    <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar">

      <div v-if="activeTab === 'timestamp'" class="space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-bold opacity-60">当前时间戳 (ms/s)</label>
          <div class="flex gap-2">
            <input v-model="tsInput" @input="convertTs" type="text" class="flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 ring-blue-500/20 outline-none">
            <button @click="nowTimestamp" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600">现在</button>
          </div>
        </div>
        <div class="p-4 bg-gray-50 rounded-xl text-center">
          <div class="text-xs opacity-50 mb-1">转换结果</div>
          <div class="text-lg font-bold text-gray-800">{{ tsDateStr }}</div>
        </div>
      </div>

      <div v-if="activeTab === 'cron'" class="space-y-4">
        <div class="space-y-2">
          <label class="text-xs font-bold opacity-60">Cron 表达式</label>
          <div class="flex gap-2">
            <input v-model="cronInput" type="text" class="flex-1 bg-gray-50 border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 ring-orange-500/20 outline-none">
            <button @click="copyCron" class="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><PhCopy size="16"/></button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="p in cronPresets" :key="p.label" @click="cronInput = p.value" class="p-2 border rounded-lg text-xs hover:border-orange-500 hover:text-orange-600 transition-colors text-left">
            <div class="font-bold">{{ p.label }}</div>
            <div class="font-mono opacity-50 scale-90 origin-left">{{ p.value }}</div>
          </button>
        </div>
        <div class="text-[10px] text-center opacity-40 pt-2">
          <a href="https://crontab.guru/" target="_blank" class="hover:underline hover:text-orange-500">需要高级生成器? 点击前往 crontab.guru -></a>
        </div>
      </div>

      <div v-if="activeTab === 'json'" class="h-full flex flex-col gap-2">
        <div class="flex justify-end gap-2">
          <button @click="formatJson" class="px-3 py-1 bg-green-50 text-green-600 rounded-md text-xs font-bold hover:bg-green-100">格式化</button>
          <button @click="compressJson" class="px-3 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-bold hover:bg-gray-200">压缩</button>
          <button @click="jsonInput = ''" class="px-3 py-1 bg-red-50 text-red-600 rounded-md text-xs font-bold hover:bg-red-100">清空</button>
        </div>
        <textarea v-model="jsonInput" placeholder="在此粘贴 JSON..." class="flex-1 w-full bg-gray-50 border rounded-lg p-3 text-xs font-mono focus:ring-2 ring-green-500/20 outline-none resize-none"></textarea>
        <div v-if="jsonError" class="text-xs text-red-500 font-bold">{{ jsonError }}</div>
      </div>

      <div v-if="activeTab === 'jwt'" class="h-full flex flex-col gap-3">
        <textarea v-model="jwtInput" @input="decodeJwt" placeholder="粘贴 Encoded Token (ey...)" class="w-full h-24 bg-gray-50 border rounded-lg p-3 text-xs font-mono focus:ring-2 ring-purple-500/20 outline-none resize-none"></textarea>
        <div class="flex-1 overflow-y-auto space-y-2">
          <div v-if="jwtHeader">
            <label class="text-[10px] font-bold opacity-60 uppercase">Header</label>
            <pre class="bg-gray-800 text-green-400 p-2 rounded-lg text-[10px] overflow-x-auto">{{ jwtHeader }}</pre>
          </div>
          <div v-if="jwtPayload">
            <label class="text-[10px] font-bold opacity-60 uppercase">Payload</label>
            <pre class="bg-gray-800 text-blue-400 p-2 rounded-lg text-[10px] overflow-x-auto">{{ jwtPayload }}</pre>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 4px; }
</style>