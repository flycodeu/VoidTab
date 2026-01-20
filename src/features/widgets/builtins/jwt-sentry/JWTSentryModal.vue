<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch} from 'vue'
import {useClipboard, useDateFormat, useDebounceFn} from '@vueuse/core'
import {
  PhX, PhClipboard, PhTrash, PhCheckCircle,
  PhWarningCircle, PhHourglassHigh, PhCode, PhShieldCheck, PhCopy
} from '@phosphor-icons/vue'
import {useConfigStore} from '../../../../stores/useConfigStore'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits(['close'])

const store = useConfigStore()

//   Config Safety
if (!store.config.runtime) (store.config as any).runtime = {}
if (!store.config.runtime.auth) store.config.runtime.auth = {jwtToken: ''}

//   Debounce Save
const saveDebounced = useDebounceFn(async () => {
  if (!store.saveConfig) return
  await store.saveConfig()
}, 300)

onUnmounted(() => {
  ;(saveDebounced as any).flush?.()
})

const rawToken = computed<string>({
  get: () => store.config.runtime.auth.jwtToken ?? '',
  set: (v) => {
    store.config.runtime.auth.jwtToken = v ?? ''
    saveDebounced()
  },
})

watch(() => props.show, (v) => {
  if (!v) (saveDebounced as any).flush?.()
})

const activeTab = ref<'header' | 'payload'>('payload')

// === Parse Logic ===
const parseJWT = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return {header: null, payload: null, valid: false}

    const decodePart = (str: string) => {
      const s = str.replace(/-/g, '+').replace(/_/g, '/')
      const pad = s + '='.repeat((4 - (s.length % 4)) % 4)
      return JSON.parse(atob(pad))
    }

    return {
      header: decodePart(parts[0]),
      payload: decodePart(parts[1]),
      valid: true
    }
  } catch {
    return {header: null, payload: null, valid: false}
  }
}

const decodedData = computed(() => parseJWT(rawToken.value))

// === Timer ===
const now = ref(Math.floor(Date.now() / 1000))
let timer: number | undefined

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000)
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const expiryInfo = computed(() => {
  const exp = decodedData.value.payload?.exp
  if (!exp) return {status: 'NO_EXP', percent: 100, text: 'No Expiration'}

  const iat = decodedData.value.payload?.iat || (exp - 3600)
  const totalDuration = Math.max(1, exp - iat)
  const timeLeft = exp - now.value

  if (timeLeft <= 0) return {status: 'EXPIRED', percent: 0, text: 'Token Expired'}

  const percent = Math.max(0, Math.min(100, (timeLeft / totalDuration) * 100))

  // Format time left
  const d = Math.floor(timeLeft / 86400);
  const h = Math.floor((timeLeft % 86400) / 3600);
  const m = Math.floor((timeLeft % 3600) / 60);
  const s = timeLeft % 60;

  let text = '';
  if (d > 0) text = `${d}d ${h}h remaining`;
  else if (h > 0) text = `${h}h ${m}m remaining`;
  else text = `${m}m ${s}s remaining`;

  return {
    status: 'ACTIVE',
    percent,
    text
  }
})

// === Actions ===
const {copy, copied} = useClipboard()

const pasteFromClipboard = async () => {
  try {
    const text = await navigator.clipboard.readText()
    if (text) rawToken.value = text.trim()
  } catch (e) {
    console.error(e)
  }
}

// === Syntax Highlight (Theme Aware) ===
const syntaxHighlight = (json: any) => {
  if (!json) return ''
  let str = JSON.stringify(json, null, 2)
  str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return str.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'text-indigo-600 dark:text-indigo-400' // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'text-sky-600 dark:text-sky-400 font-bold' // key
          } else {
            cls = 'text-emerald-600 dark:text-emerald-400' // string
          }
        } else if (/true|false/.test(match)) {
          cls = 'text-rose-600 dark:text-rose-400' // boolean
        } else if (/null/.test(match)) {
          cls = 'text-gray-500' // null
        }
        return `<span class="${cls}">${match}</span>`
      }
  )
}
</script>

<template>
  <Transition name="fade-scale">
    <div v-if="show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" @click="emit('close')"></div>

      <div
          class="relative w-full max-w-5xl h-[85vh] md:h-[80vh] flex flex-col md:flex-row bg-[var(--settings-surface)] border border-[var(--settings-border)] rounded-xl shadow-2xl overflow-hidden text-[var(--settings-text)] transition-all duration-300"
      >
        <div
            class="w-full md:w-[340px] flex flex-col border-b md:border-b-0 md:border-r border-[var(--settings-border)] bg-[var(--settings-panel)]">
          <div class="p-4 border-b border-[var(--settings-border)] flex items-center justify-between shrink-0">
            <h2 class="text-sm font-bold tracking-wider flex items-center gap-2 text-[var(--settings-text)]">
              <PhShieldCheck size="18" weight="fill" class="text-[var(--accent-color)]"/>
              JWT INSPECTOR
            </h2>
            <button
                @click="emit('close')"
                class="p-1 rounded-md hover:bg-[var(--settings-border)] transition-colors text-[var(--settings-text-secondary)] hover:text-[var(--settings-text)]"
            >
              <PhX size="18"/>
            </button>
          </div>

          <div class="p-4 flex-1 flex flex-col min-h-0">
            <div class="flex justify-between items-center mb-2">
              <span
                  class="text-[10px] font-bold text-[var(--settings-text-secondary)] tracking-wider">ENCODED TOKEN</span>
              <div class="flex gap-2">
                <button
                    @click="rawToken = ''"
                    class="text-[10px] flex items-center gap-1 hover:text-red-500 text-[var(--settings-text-secondary)] transition-colors px-2 py-1 rounded hover:bg-[var(--settings-input-bg)]"
                    title="Clear"
                >
                  <PhTrash/>
                  CLEAR
                </button>
                <button
                    @click="pasteFromClipboard"
                    class="text-[10px] flex items-center gap-1 hover:text-[var(--accent-color)] text-[var(--settings-text-secondary)] transition-colors px-2 py-1 rounded hover:bg-[var(--settings-input-bg)]"
                    title="Paste from Clipboard"
                >
                  <PhClipboard/>
                  PASTE
                </button>
              </div>
            </div>

            <textarea
                v-model="rawToken"
                class="w-full flex-1 bg-[var(--settings-input-bg)] border border-[var(--settings-border-soft)] rounded-lg p-3 text-[11px] font-mono text-[var(--settings-text)] resize-none outline-none focus:border-[var(--accent-color)] focus:ring-1 focus:ring-[var(--accent-color)] transition-all custom-scroll break-all leading-relaxed"
                placeholder="Paste your Bearer Token here..."
            ></textarea>
          </div>

          <div
              class="p-4 border-t border-[var(--settings-border)] bg-[var(--settings-surface)] relative overflow-hidden shrink-0">
            <div v-if="expiryInfo.status === 'EXPIRED'"
                 class="absolute inset-0 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
              <div
                  class="border-4 border-red-500/20 text-red-500/20 text-4xl font-black rotate-[-12deg] p-4 rounded uppercase tracking-widest stamp-anim select-none">
                EXPIRED
              </div>
            </div>

            <div class="relative z-10 space-y-3">
              <div class="flex items-center gap-2">
                <PhCheckCircle v-if="expiryInfo.status === 'ACTIVE'" size="20" weight="fill" class="text-emerald-500"/>
                <PhWarningCircle v-else-if="expiryInfo.status === 'EXPIRED'" size="20" weight="fill"
                                 class="text-rose-500"/>
                <PhHourglassHigh v-else size="20" weight="duotone" class="text-[var(--settings-text-secondary)]"/>

                <span
                    class="font-bold text-sm"
                    :class="{
                    'text-emerald-500': expiryInfo.status === 'ACTIVE',
                    'text-rose-500': expiryInfo.status === 'EXPIRED',
                    'text-[var(--settings-text-secondary)]': expiryInfo.status === 'NO_EXP'
                  }"
                >{{ expiryInfo.status === 'NO_EXP' ? 'NO EXPIRATION' : expiryInfo.status }}</span>
              </div>

              <div
                  class="relative h-8 bg-[var(--settings-input-bg)] rounded-md border border-[var(--settings-border-soft)] overflow-hidden flex items-center justify-center">
                <div
                    class="absolute inset-y-0 left-0 opacity-20 transition-all duration-1000 ease-linear"
                    :class="expiryInfo.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'"
                    :style="{ width: expiryInfo.percent + '%' }"
                ></div>
                <span class="relative z-10 text-[10px] font-mono font-bold tracking-wider text-[var(--settings-text)]">{{
                    expiryInfo.text
                  }}</span>
              </div>

              <div class="grid grid-cols-2 gap-4 pt-1">
                <div class="flex flex-col">
                  <span class="text-[9px] font-bold text-[var(--settings-text-secondary)] mb-0.5">ISSUED AT</span>
                  <span class="text-[11px] font-mono text-[var(--settings-text)]">
                     {{
                      decodedData.payload?.iat ? useDateFormat(decodedData.payload.iat * 1000, 'HH:mm:ss').value : '--:--:--'
                    }}
                   </span>
                </div>
                <div class="flex flex-col text-right">
                  <span class="text-[9px] font-bold text-[var(--settings-text-secondary)] mb-0.5">EXPIRES AT</span>
                  <span class="text-[11px] font-mono text-[var(--settings-text)]">
                     {{
                      decodedData.payload?.exp ? useDateFormat(decodedData.payload.exp * 1000, 'HH:mm:ss').value : '--:--:--'
                    }}
                   </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex-1 flex flex-col bg-[var(--settings-surface)] min-w-0 relative">
          <div
              class="flex items-center border-b border-[var(--settings-border)] bg-[var(--settings-surface)] shrink-0 px-2">
            <button
                @click="activeTab = 'payload'"
                class="px-4 py-3 text-[11px] font-bold tracking-wider border-b-2 transition-all"
                :class="activeTab === 'payload' ? 'border-[var(--accent-color)] text-[var(--settings-text)]' : 'border-transparent text-[var(--settings-text-secondary)] hover:text-[var(--settings-text)]'"
            >PAYLOAD
            </button>

            <button
                @click="activeTab = 'header'"
                class="px-4 py-3 text-[11px] font-bold tracking-wider border-b-2 transition-all"
                :class="activeTab === 'header' ? 'border-[var(--accent-color)] text-[var(--settings-text)]' : 'border-transparent text-[var(--settings-text-secondary)] hover:text-[var(--settings-text)]'"
            >HEADER
            </button>

            <div class="ml-auto px-2">
              <button
                  @click="copy(JSON.stringify((decodedData as any)[activeTab], null, 2))"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold bg-[var(--settings-panel)] border border-[var(--settings-border-soft)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] text-[var(--settings-text-secondary)] transition-all"
              >
                <PhCheckCircle v-if="copied" weight="fill" class="text-emerald-500"/>
                <PhCopy v-else/>
                <span>{{ copied ? 'COPIED' : 'COPY JSON' }}</span>
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-auto p-6 custom-scroll relative bg-[var(--settings-surface)]">
            <div v-if="!decodedData.valid"
                 class="absolute inset-0 flex items-center justify-center flex-col gap-3 text-[var(--settings-text-secondary)] select-none">
              <div class="p-4 rounded-full bg-[var(--settings-panel)] border border-[var(--settings-border)]">
                <PhCode size="32" weight="duotone"/>
              </div>
              <span class="text-xs font-medium tracking-wide">Waiting for valid token...</span>
            </div>

            <pre v-else
                 class="text-[13px] leading-relaxed font-mono selection:bg-[var(--accent-color)] selection:text-white"
                 v-html="syntaxHighlight((decodedData as any)[activeTab])"></pre>
          </div>

          <div
              class="h-8 border-t border-[var(--settings-border)] bg-[var(--settings-panel)] flex items-center justify-between px-4 text-[10px] text-[var(--settings-text-secondary)] select-none">
            <span>Local Processing Only</span>
            <span>JSON Web Token</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 自定义滚动条，使其更细腻 */
.custom-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: var(--settings-border);
  border-radius: 3px;
}

.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--settings-text-secondary);
}

/* 印章动画 */
.stamp-anim {
  animation: stamp-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  opacity: 0;
  transform: scale(3) rotate(-12deg);
}

@keyframes stamp-in {
  to {
    opacity: 1;
    transform: scale(1) rotate(-12deg);
  }
}

/* 模态框过渡动画 */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>