<script setup lang="ts">
import {computed, ref, onUnmounted} from 'vue'
import {useTimeAgo, useDebounceFn} from '@vueuse/core'
import type {SiteItem} from '../../../../core/config/types'
import {
  PhShieldCheck, PhShieldWarning, PhFingerprint,
  PhIdentificationCard, PhClockCountdown, PhLockKey, PhKey
} from '@phosphor-icons/vue'
import JWTSentryModal from './JWTSentryModal.vue'
import {useConfigStore} from '../../../../stores/useConfigStore'

const props = defineProps<{ item: SiteItem; isEditMode: boolean }>()
const store = useConfigStore()

//   Config Safety Check
if (!store.config.runtime) (store.config as any).runtime = {}
if (!store.config.runtime.auth) store.config.runtime.auth = {jwtToken: ''}

//   Debounced Save
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

const showModal = ref(false)
const openModal = () => {
  if (props.isEditMode) return
  showModal.value = true
}

// ===== JWT Decode Logic =====
function b64urlJsonDecode(str: string) {
  try {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padLen = (4 - (base64.length % 4)) % 4
    const padded = base64 + '='.repeat(padLen)
    return JSON.parse(atob(padded))
  } catch (e) {
    return null
  }
}

const decoded = computed<null | { header: any; payload: any }>(() => {
  if (!rawToken.value) return null
  try {
    const parts = rawToken.value.split('.')
    if (parts.length !== 3) return null
    return {
      header: b64urlJsonDecode(parts[0]),
      payload: b64urlJsonDecode(parts[1]),
    }
  } catch {
    return null
  }
})

const status = computed<'EMPTY' | 'INVALID' | 'ACTIVE' | 'EXPIRED' | 'NO_EXP'>(() => {
  if (!rawToken.value) return 'EMPTY'
  if (!decoded.value || !decoded.value.payload) return 'INVALID'

  const exp = decoded.value.payload.exp
  if (typeof exp === 'number') {
    const now = Math.floor(Date.now() / 1000)
    return exp > now ? 'ACTIVE' : 'EXPIRED'
  }
  return 'NO_EXP'
})

const timeAgo = useTimeAgo(computed(() => {
  const exp = decoded.value?.payload?.exp
  return typeof exp === 'number' ? exp * 1000 : Date.now()
}))

const layout = computed(() => {
  const w = props.item.w || 1
  const h = props.item.h || 1
  return {
    isMini: w === 1 && h === 1,
    isWide: w >= 2 && h === 1,
    isTall: w === 1 && h >= 2,
    isStandard: w === 2 && h === 2,
    isLarge: w >= 2 && h >= 3
  }
})

//   Helper to truncate ID for display
const shortSub = computed(() => {
  const sub = decoded.value?.payload?.sub || decoded.value?.payload?.name || 'UNKNOWN'
  return String(sub).length > 12 ? String(sub).substring(0, 10) + '..' : sub
})
</script>

<template>
  <div
      class="w-full h-full relative overflow-hidden group font-sans rounded-[22px] transition-all duration-300"
      :class="[
        !isEditMode ? 'cursor-pointer' : 'cursor-move',
        'bg-[var(--widget-surface)] text-[var(--widget-text)] border border-[var(--widget-border)] hover:bg-[var(--widget-surface-2)] shadow-sm'
      ]"
      @click="openModal"
  >
    <PhKey
        class="absolute -bottom-4 -right-4 text-[var(--widget-text)] opacity-[0.03] rotate-[-15deg]"
        :size="120"
        weight="fill"
    />

    <div v-if="status === 'EMPTY'"
         class="relative z-10 w-full h-full flex flex-col items-center justify-center p-2 opacity-60">
      <PhFingerprint size="24" class="mb-1 text-[var(--widget-muted)]"/>
      <span class="text-[10px] font-bold tracking-wider text-[var(--widget-muted)]">NO TOKEN</span>
    </div>

    <div v-else-if="status === 'INVALID'"
         class="relative z-10 w-full h-full flex flex-col items-center justify-center p-2 text-red-500">
      <PhShieldWarning size="24" class="mb-1 animate-pulse"/>
      <span class="text-[10px] font-bold">INVALID TOKEN</span>
    </div>

    <div v-else-if="layout.isMini"
         class="relative z-10 w-full h-full flex flex-col items-center justify-center p-2 gap-1">
      <PhShieldCheck v-if="status === 'ACTIVE' || status === 'NO_EXP'" size="22" weight="fill"
                     class="text-emerald-500"/>
      <PhLockKey v-else size="22" weight="fill" class="text-rose-500"/>

      <div
          class="text-[10px] font-bold tracking-tight px-1.5 py-0.5 rounded-full"
          :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
      >
        {{ status === 'NO_EXP' ? 'VALID' : status }}
      </div>
    </div>

    <div v-else-if="layout.isWide" class="relative z-10 w-full h-full flex items-center justify-between px-4 py-2">
      <div class="flex items-center gap-3 overflow-hidden">
        <div
            class="p-2 rounded-lg shrink-0 flex items-center justify-center"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'"
        >
          <PhIdentificationCard size="20" weight="duotone"/>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-bold truncate text-[var(--widget-text)]">{{ shortSub }}</span>
          <span class="text-[10px] text-[var(--widget-muted)] truncate">Identity Token</span>
        </div>
      </div>

      <div class="shrink-0 flex flex-col items-end">
        <div
            class="w-2 h-2 rounded-full mb-1"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'bg-emerald-500' : 'bg-rose-500'"
        ></div>
        <span class="text-[9px] font-bold text-[var(--widget-muted)] opacity-80">{{ status }}</span>
      </div>
    </div>

    <div v-else-if="layout.isStandard" class="relative z-10 w-full h-full flex flex-col p-4 justify-between">
      <div class="flex justify-between items-center">
        <span class="text-[10px] font-bold text-[var(--widget-muted)] tracking-wider">AUTH SENTRY</span>
        <div
            class="text-[10px] font-bold px-1.5 py-0.5 rounded"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'"
        >
          {{ status }}
        </div>
      </div>

      <div class="flex flex-col items-center my-auto text-center">
        <div class="text-2xl font-bold mb-1 text-[var(--widget-text)] tracking-tight">
          {{ shortSub }}
        </div>

        <div class="flex items-center gap-1.5 text-xs text-[var(--widget-muted)] mt-1">
          <PhClockCountdown size="14"/>
          <span>{{ status === 'EXPIRED' ? 'Expired' : 'Valid until' }}</span>
        </div>

        <div
            class="text-xs font-mono font-medium mt-1"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ status === 'NO_EXP' ? '∞' : timeAgo }}
        </div>
      </div>

      <div class="w-full bg-[var(--widget-border)] h-1 rounded-full overflow-hidden mt-1">
        <div
            class="h-full rounded-full transition-all duration-500"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'bg-emerald-500' : 'bg-rose-500'"
            :style="{ width: status === 'ACTIVE' || status === 'NO_EXP' ? '100%' : '100%' }"
        ></div>
      </div>
    </div>

    <div v-else class="relative z-10 w-full h-full flex flex-col p-4">
      <div class="flex justify-between items-center mb-3 pb-2 border-b border-[var(--widget-border)]">
        <span class="text-xs font-bold flex items-center gap-2 text-[var(--widget-text)]">
          <PhShieldCheck weight="fill" class="text-emerald-500"/>
          JWT INSPECTOR
        </span>
        <span
            class="text-[9px] font-bold px-2 py-0.5 rounded-full border border-[var(--widget-border)] bg-[var(--widget-surface-2)]"
            :class="status === 'ACTIVE' || status === 'NO_EXP' ? 'text-emerald-500' : 'text-rose-500'"
        >
          {{ status }}
        </span>
      </div>

      <div class="flex-1 overflow-hidden space-y-3">
        <div class="group/item">
          <div class="flex items-center justify-between text-[10px] text-[var(--widget-muted)] mb-0.5">
            <span>SUBJECT</span>
            <span class="opacity-0 group-hover/item:opacity-100 transition-opacity">sub</span>
          </div>
          <div
              class="text-xs font-mono font-medium text-[var(--widget-text)] truncate bg-[var(--widget-surface-2)] px-2 py-1 rounded border border-[var(--widget-border)]">
            {{ decoded?.payload?.sub || 'N/A' }}
          </div>
        </div>

        <div class="group/item">
          <div class="flex items-center justify-between text-[10px] text-[var(--widget-muted)] mb-0.5">
            <span>ISSUER</span>
            <span class="opacity-0 group-hover/item:opacity-100 transition-opacity">iss</span>
          </div>
          <div class="text-xs font-medium text-[var(--widget-text)] truncate pl-1">
            {{ decoded?.payload?.iss || 'N/A' }}
          </div>
        </div>
      </div>

      <div class="mt-auto pt-3 flex justify-between items-end">
        <div class="flex flex-col text-[10px] text-[var(--widget-muted)]">
          <span>ALGORITHM</span>
          <span class="font-bold text-[var(--widget-text)]">{{ decoded?.header?.alg || 'HS256' }}</span>
        </div>
        <div class="flex flex-col text-[10px] text-[var(--widget-muted)] text-right">
          <span>TYPE</span>
          <span class="font-bold text-[var(--widget-text)]">Bearer</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <JWTSentryModal :show="showModal" @close="showModal = false"/>
    </Teleport>
  </div>
</template>

<style scoped>

</style>