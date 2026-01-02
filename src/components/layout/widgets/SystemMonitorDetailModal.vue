<script setup lang="ts">
import {PhX, PhGlobe, PhCpu, PhWifiHigh, PhActivity} from '@phosphor-icons/vue';

defineProps<{ show: boolean; stats: any }>();
const emit = defineEmits(['close']);
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-md" @click="emit('close')"></div>

      <div class="relative w-[500px] bg-[#1a1a1a] border border-white/10 rounded-3xl shadow-2xl p-8 text-white">
        <button @click="emit('close')"
                class="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition text-white/40 hover:text-white">
          <PhX size="20"/>
        </button>

        <div class="flex items-center gap-4 mb-8">
          <div class="p-4 bg-green-500/20 rounded-2xl text-green-400">
            <PhActivity size="32" weight="duotone"/>
          </div>
          <div>
            <h3 class="text-xl font-bold">系统实时监控</h3>
            <p class="text-sm text-white/40">详细资源占用与网络状态</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
            <div class="flex items-center gap-2 mb-3 text-white/40 text-xs font-bold uppercase">
              <PhWifiHigh size="16"/>
              网络连接
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span>延迟</span><span
                  class="text-green-400 font-mono">{{ stats.ping }}ms</span></div>
              <div class="flex justify-between text-sm"><span>下载</span><span class="font-mono">{{ stats.download }} MB/s</span>
              </div>
              <div class="flex justify-between text-sm"><span>上传</span><span class="font-mono">{{
                  stats.upload
                }} MB/s</span></div>
            </div>
          </div>

          <div class="bg-white/5 p-5 rounded-2xl border border-white/5">
            <div class="flex items-center gap-2 mb-3 text-white/40 text-xs font-bold uppercase">
              <PhCpu size="16"/>
              资源负载
            </div>
            <div class="space-y-3">
              <div class="flex justify-between text-sm"><span>浏览器内存</span><span>{{ stats.memory }}%</span></div>
              <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 transition-all duration-1000"
                     :style="{ width: stats.memory + '%' }"></div>
              </div>
            </div>
          </div>

          <div class="col-span-2 bg-white/5 p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <PhGlobe size="24" class="text-blue-400"/>
              <div>
                <div class="text-[10px] text-white/30 uppercase font-bold">Local IP Address</div>
                <div class="text-lg font-mono tracking-wider">{{ stats.ip }}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-white/30 uppercase font-bold">Browser info</div>
              <div class="text-sm opacity-80">{{ stats.browser }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>