<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {
  PhX,
  PhGlobe,
  PhCpu,
  PhWifiHigh,
  PhActivity,
  PhHardDrives,
  PhDesktop,
  PhBatteryFull,
  PhClock,
  PhMonitor,
  PhBrowsers
} from '@phosphor-icons/vue';
import type {SystemStats} from '../../../../core/system/systemStats';
import {useEscapeClose} from '../../../../shared/composables/useEscapeClose';

const props = defineProps<{ show: boolean; stats: SystemStats | null }>();
const emit = defineEmits(['close']);
useEscapeClose(() => props.show, () => emit('close'));

// ---------------- 数据处理 ----------------

// 网络
const pingText = computed(() => {
  const v = props.stats?.latencyMs ?? props.stats?.net.rttMs;
  return typeof v === 'number' ? `${v} ms` : '--';
});

const netType = computed(() => props.stats?.net.effectiveType?.toUpperCase() ?? 'WIFI');
const downlink = computed(() => props.stats?.net.downlinkMbps ? `${props.stats.net.downlinkMbps} Mbps` : '--');

const performanceInfo = computed(() => {
  const perf = props.stats?.performance;
  return {
    appP95: typeof perf?.app.p95DurationMs === 'number' ? `${perf.app.p95DurationMs} ms` : '--',
    networkP95: typeof perf?.network.p95DurationMs === 'number' ? `${perf.network.p95DurationMs} ms` : '--',
    budgetText: perf?.budgets ? `${perf.budgets.violationCount}/${perf.budgets.trackedCount}` : '--',
    lastBudgetViolation: perf?.app.lastBudgetViolation || '--',
  };
});

// 内存
const memoryInfo = computed(() => {
  const m = props.stats?.memory;
  if (!m) return {text: '-- / --', percent: 0};

  if (typeof m.totalMB === 'number' && typeof m.availableMB === 'number') {
    const used = m.totalMB - m.availableMB;
    const pct = m.usedPercent ?? Math.round((used / m.totalMB) * 100);
    return {
      text: `${(used / 1024).toFixed(1)}GB / ${(m.totalMB / 1024).toFixed(1)}GB`,
      percent: pct
    };
  }

  if (typeof m.jsHeapUsedMB === 'number' && typeof m.jsHeapLimitMB === 'number') {
    const pct = Math.round((m.jsHeapUsedMB / m.jsHeapLimitMB) * 100);
    return {
      text: `${m.jsHeapUsedMB}MB / ${m.jsHeapLimitMB}MB`,
      percent: pct
    };
  }

  return {text: 'N/A', percent: 0};
});

// UA 简化
const browserName = computed(() => {
  const ua = props.stats?.browser.ua ?? '';
  if (ua.includes('Edg/')) return 'Edge Browser';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
});

const osName = computed(() => {
  const ua = props.stats?.browser.ua ?? '';
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone')) return 'iOS';
  return 'System';
});

const screenInfo = computed(() => {
  if (typeof window === 'undefined') return 'N/A';
  return `${window.screen.width}×${window.screen.height}`;
});

const batteryLevel = ref('检测中...');
onMounted(async () => {
  if ('getBattery' in navigator) {
    try {
      const b = await (navigator as any).getBattery();
      batteryLevel.value = `${Math.round(b.level * 100)}%`;
    } catch {
      batteryLevel.value = 'N/A';
    }
  } else {
    batteryLevel.value = 'N/A';
  }
});

const uptime = computed(() => {
  const sec = Math.floor(performance.now() / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} mins`;
});
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <!-- 遮罩：用全局 overlay 体系 -->
      <div class="settings-mask absolute inset-0" @click="emit('close')"></div>

      <!-- 弹窗主体：用 settings-surface -->
      <div class="settings-shell relative w-full max-w-[900px] rounded-[24px] overflow-hidden">
        <button
            @click="emit('close')"
            class="settings-close absolute top-4 right-4 z-20 p-2 rounded-full"
        >
          <PhX size="20"/>
        </button>

        <div class="w-full flex flex-col md:flex-row">
          <!-- 左侧 -->
          <div class="settings-left w-full md:w-[260px] p-6 flex flex-col border-b md:border-b-0 md:border-r">
            <div class="flex flex-col items-center mt-3 mb-8">
              <div class="settings-logo w-16 h-16 rounded-2xl flex items-center justify-center mb-4">
                <PhActivity size="32" class="text-white"/>
              </div>
              <h2 class="text-lg font-bold settings-title">系统监控</h2>
              <p class="text-xs settings-subtitle mt-1">System Monitor</p>
            </div>

            <div class="space-y-3 mt-auto">
              <div class="settings-card rounded-xl p-3 flex items-center gap-3">
                <div class="settings-icon-chip rounded-lg p-2">
                  <PhDesktop size="18"/>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] settings-muted uppercase font-bold">OS</div>
                  <div class="text-sm font-medium settings-text truncate">{{ osName }}</div>
                </div>
              </div>

              <div class="settings-card rounded-xl p-3 flex items-center gap-3">
                <div class="settings-icon-chip rounded-lg p-2">
                  <PhBrowsers size="18"/>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] settings-muted uppercase font-bold">Browser</div>
                  <div class="text-sm font-medium settings-text truncate">{{ browserName }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 右侧 -->
          <div class="flex-1 p-6 md:p-8 overflow-y-auto max-h-[80vh]">
            <div class="flex items-center gap-2 mb-6">
              <div class="w-1.5 h-1.5 rounded-full settings-dot"></div>
              <span class="text-xs font-bold settings-muted uppercase tracking-widest">Real-time Dashboard</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- 网络 -->
              <div class="settings-card rounded-2xl p-5 border transition-colors">
                <div class="flex items-center gap-2 mb-5">
                  <PhWifiHigh size="20" class="settings-accent"/>
                  <span class="text-sm font-bold settings-text">网络连接</span>
                </div>

                <div class="space-y-4">
                  <div class="flex justify-between items-center">
                    <span class="text-xs settings-muted">延迟 (RTT)</span>
                    <span class="text-sm font-mono font-bold settings-good">{{ pingText }}</span>
                  </div>
                  <div class="settings-divider"></div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs settings-muted">下行速度</span>
                    <span class="text-sm font-mono settings-text">{{ downlink }}</span>
                  </div>
                  <div class="settings-divider"></div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs settings-muted">连接类型</span>
                    <span class="text-xs font-bold settings-pill">{{ netType }}</span>
                  </div>
                </div>
              </div>

              <!-- 资源 -->
              <div class="settings-card rounded-2xl p-5 border transition-colors">
                <div class="flex items-center gap-2 mb-5">
                  <PhCpu size="20" class="settings-accent"/>
                  <span class="text-sm font-bold settings-text">资源占用</span>
                </div>

                <div class="space-y-4">
                  <div class="flex justify-between items-center">
                    <span class="text-xs settings-muted">逻辑核心</span>
                    <span class="text-sm font-mono settings-text">
                      {{ props.stats?.cpu.logicalCores ?? '-' }} Cores
                    </span>
                  </div>

                  <div>
                    <div class="flex justify-between text-xs mb-2">
                      <span class="settings-muted">内存使用率</span>
                      <span class="settings-text font-mono">{{ memoryInfo.percent }}%</span>
                    </div>

                    <div class="h-1.5 w-full settings-bar rounded-full overflow-hidden">
                      <div class="h-full settings-bar-fill transition-all duration-500"
                           :style="{width: memoryInfo.percent + '%'}"></div>
                    </div>

                    <div class="text-[10px] settings-muted mt-2 font-mono text-right truncate">
                      {{ memoryInfo.text }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 性能预算 -->
              <div class="col-span-1 md:col-span-2 settings-card rounded-2xl p-5 border transition-colors">
                <div class="flex items-center gap-2 mb-5">
                  <PhActivity size="20" class="settings-accent"/>
                  <span class="text-sm font-bold settings-text">性能预算</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div class="settings-subcard rounded-xl p-3 border min-w-0">
                    <div class="text-[10px] settings-muted uppercase font-bold mb-1">Budget</div>
                    <div class="text-sm font-mono settings-text truncate">{{ performanceInfo.budgetText }}</div>
                  </div>
                  <div class="settings-subcard rounded-xl p-3 border min-w-0">
                    <div class="text-[10px] settings-muted uppercase font-bold mb-1">App P95</div>
                    <div class="text-sm font-mono settings-text truncate">{{ performanceInfo.appP95 }}</div>
                  </div>
                  <div class="settings-subcard rounded-xl p-3 border min-w-0">
                    <div class="text-[10px] settings-muted uppercase font-bold mb-1">Network P95</div>
                    <div class="text-sm font-mono settings-text truncate">{{ performanceInfo.networkP95 }}</div>
                  </div>
                </div>

                <div class="settings-divider my-4"></div>
                <div class="flex items-center justify-between gap-4 min-w-0">
                  <span class="text-xs settings-muted shrink-0">最近超限</span>
                  <span class="text-xs font-mono settings-text truncate">{{ performanceInfo.lastBudgetViolation }}</span>
                </div>
              </div>

              <!-- 硬件 -->
              <div class="col-span-1 md:col-span-2 settings-card rounded-2xl p-5 border transition-colors">
                <div class="flex items-center gap-2 mb-4">
                  <PhHardDrives size="20" class="settings-accent"/>
                  <span class="text-sm font-bold settings-text">硬件与环境</span>
                </div>

                <div class="grid grid-cols-3 gap-4">
                  <div class="settings-subcard rounded-xl p-3 border">
                    <div class="flex items-center gap-2 settings-muted mb-1">
                      <PhMonitor size="14"/>
                      <span class="text-[10px] font-bold uppercase">屏幕</span>
                    </div>
                    <div class="text-sm font-mono settings-text truncate" :title="screenInfo">{{ screenInfo }}</div>
                  </div>

                  <div class="settings-subcard rounded-xl p-3 border">
                    <div class="flex items-center gap-2 settings-muted mb-1">
                      <PhBatteryFull size="14"/>
                      <span class="text-[10px] font-bold uppercase">电池</span>
                    </div>
                    <div class="text-sm font-mono settings-text truncate">{{ batteryLevel }}</div>
                  </div>

                  <div class="settings-subcard rounded-xl p-3 border">
                    <div class="flex items-center gap-2 settings-muted mb-1">
                      <PhClock size="14"/>
                      <span class="text-[10px] font-bold uppercase">会话</span>
                    </div>
                    <div class="text-sm font-mono settings-text truncate">{{ uptime }}</div>
                  </div>
                </div>
              </div>

              <!-- IP -->
              <div class="col-span-1 md:col-span-2 settings-bottom rounded-xl p-4 border flex items-center justify-between gap-4 mt-2">
                <div class="flex items-center gap-3 overflow-hidden">
                  <div class="p-2 settings-badge rounded-full shrink-0">
                    <PhGlobe size="18"/>
                  </div>
                  <div class="min-w-0">
                    <div class="text-[10px] settings-muted uppercase font-bold tracking-wider">Public IP</div>
                    <div class="text-sm font-mono settings-text truncate">
                      {{ stats?.geo?.ip || '127.0.0.1' }}
                      <span class="settings-muted mx-1">/</span>
                      {{ stats?.geo?.city || 'Local' }}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 遮罩：跟全站一致 */
.settings-mask{
  background: color-mix(in srgb, var(--bg-overlay) calc(var(--bg-overlay-opacity) * 100%), transparent);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

/* 弹窗主体：完全跟 settings 面板统一 */
.settings-shell{
  background: var(--settings-surface);
  border: 1px solid var(--settings-border);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}

/* 关闭按钮：一致的 glass/button */
.settings-close{
  color: var(--settings-text-secondary);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--settings-border);
  transition: all .2s var(--ease-spring);
}
.settings-close:hover{
  color: var(--settings-text);
  background: rgba(255,255,255,0.10);
}

/* 左侧：用 settings-panel，不再写死 #111 */
.settings-left{
  background: var(--settings-panel);
  border-color: var(--settings-border);
}

.settings-logo{
  background: linear-gradient(135deg, rgba(var(--accent-color-rgb), .95), rgba(var(--accent-color-rgb), .65));
  box-shadow: 0 12px 28px rgba(var(--accent-color-rgb), .22);
}

.settings-title{ color: var(--settings-text); }
.settings-subtitle{ color: var(--settings-text-secondary); }

.settings-text{ color: var(--settings-text); }
.settings-muted{ color: var(--settings-text-secondary); }

/* 卡片：统一 bento/glass */
.settings-card{
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--settings-border);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
  transition: all .2s var(--ease-spring);
}
.settings-card:hover{
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.16);
}

/* 小卡片 */
.settings-subcard{
  background: rgba(255,255,255,0.04);
  border-color: var(--settings-border);
}

/* 分割线 */
.settings-divider{
  height: 1px;
  width: 100%;
  background: rgba(255,255,255,0.08);
}

/* pill */
.settings-pill{
  color: var(--settings-text-secondary);
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.10);
  padding: 4px 10px;
  border-radius: 999px;
}

/* 进度条 */
.settings-bar{
  background: rgba(255,255,255,0.10);
}
.settings-bar-fill{
  background: linear-gradient(90deg,
  rgba(var(--accent-color-rgb), 0.65),
  rgba(var(--accent-color-rgb), 0.95)
  );
}

/* 绿色状态点 + good 文本（不要太跳） */
.settings-dot{
  background: rgba(34,197,94,0.9);
  box-shadow: 0 0 0 6px rgba(34,197,94,0.12);
}
.settings-good{
  color: rgba(34,197,94,0.95);
}

/* 图标 chip 统一 */
.settings-icon-chip{
  background: rgba(var(--accent-color-rgb), 0.14);
  color: rgba(var(--accent-color-rgb), 0.95);
  border: 1px solid rgba(var(--accent-color-rgb), 0.22);
}

/* 底部信息条 */
.settings-bottom{
  background: rgba(255,255,255,0.04);
  border-color: var(--settings-border);
}
.settings-badge{
  background: rgba(255,255,255,0.08);
  color: var(--settings-text-secondary);
}

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

