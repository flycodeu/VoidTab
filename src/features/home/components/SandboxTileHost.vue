<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import type {ComponentTile, JsonValue, SandboxTileDefinition} from '../../../core/tiles/contracts.ts';
import {normalizeDeclarativeUrl} from '../../../core/tiles/declarativeData.ts';
import {getCurrentHostCapabilities} from '../../../core/tiles/hostCapabilities.ts';
import {
  buildSandboxSrcDoc,
  createSandboxNonce,
  parseSandboxFrameMessage,
  SANDBOX_BRIDGE_CHANNEL,
  type SandboxFrameMessage,
} from '../../../core/tiles/sandboxBridge.ts';

const props = defineProps<{
  tile: ComponentTile;
  definition: SandboxTileDefinition;
  enabled: boolean;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const nonce = ref(createSandboxNonce());
const status = ref<'booting' | 'ready' | 'mounted' | 'error'>('booting');
const errorMessage = ref('');
const messageTimes: number[] = [];

let bootTimer = 0;

const hostCapabilities = computed(() => getCurrentHostCapabilities({sandboxRuntime: props.enabled}));
const srcDoc = computed(() => buildSandboxSrcDoc({
  definition: props.definition,
  tile: props.tile,
  nonce: nonce.value,
  host: hostCapabilities.value,
}));
const hasCapability = (type: string) => props.definition.capabilities?.some((capability) => capability.type === type) === true;
const storagePrefix = computed(() => `voidtab:sandbox-storage:v1:${props.definition.id}:${props.tile.id}:`);

const resetFrame = () => {
  nonce.value = createSandboxNonce();
  status.value = 'booting';
  errorMessage.value = '';
  window.clearTimeout(bootTimer);
  bootTimer = window.setTimeout(() => {
    if (status.value !== 'mounted' && status.value !== 'error') {
      status.value = 'error';
      errorMessage.value = 'Sandbox 启动超时';
    }
  }, 5000);
};

const canAcceptMessage = () => {
  const now = Date.now();
  while (messageTimes.length && now - messageTimes[0] > 1000) messageTimes.shift();
  if (messageTimes.length >= 24) return false;
  messageTimes.push(now);
  return true;
};

const postToFrame = (message: Record<string, unknown>) => {
  iframeRef.value?.contentWindow?.postMessage({
    channel: SANDBOX_BRIDGE_CHANNEL,
    nonce: nonce.value,
    ...message,
  }, '*');
};

const responseToRequest = (requestId: string, payload: unknown, ok = true) => {
  postToFrame(ok
      ? {kind: 'response', requestId, ok: true, payload}
      : {kind: 'response', requestId, ok: false, error: String(payload || '请求被拒绝')});
};

const cloneJsonValue = (value: unknown): JsonValue => {
  const source = JSON.stringify(value);
  if (!source || source.length > 8192) return null;
  return JSON.parse(source) as JsonValue;
};

const normalizeStorageKey = (key: unknown) => {
  if (typeof key !== 'string') return '';
  const value = key.trim();
  if (!/^[a-z0-9._:-]{1,80}$/i.test(value)) return '';
  return value;
};

const getStorageItem = (key: string): JsonValue => {
  try {
    const raw = window.localStorage.getItem(storagePrefix.value + key);
    return raw ? JSON.parse(raw) as JsonValue : null;
  } catch {
    return null;
  }
};

const setStorageItem = (key: string, value: unknown) => {
  const safeValue = cloneJsonValue(value);
  const serialized = JSON.stringify(safeValue);
  if (serialized.length > 8192) throw new Error('storage value too large');
  window.localStorage.setItem(storagePrefix.value + key, serialized);
  return true;
};

const removeStorageItem = (key: string) => {
  window.localStorage.removeItem(storagePrefix.value + key);
  return true;
};

const handleRequest = async (message: Extract<SandboxFrameMessage, {kind: 'request'}>) => {
  const payload = message.request.payload && typeof message.request.payload === 'object'
      ? message.request.payload as Record<string, unknown>
      : {};
  try {
    if (message.request.type === 'storage.get') {
      if (!hasCapability('storage')) throw new Error('未声明 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, getStorageItem(key));
      return;
    }
    if (message.request.type === 'storage.set') {
      if (!hasCapability('storage')) throw new Error('未声明 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, setStorageItem(key, payload.value));
      return;
    }
    if (message.request.type === 'storage.remove') {
      if (!hasCapability('storage')) throw new Error('未声明 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, removeStorageItem(key));
      return;
    }
    if (message.request.type === 'openUrl') {
      if (!hasCapability('openExternal')) throw new Error('未声明 openExternal 权限');
      const url = normalizeDeclarativeUrl(typeof payload.url === 'string' ? payload.url : '');
      if (!url) throw new Error('URL 无效');
      window.open(url, '_blank', 'noopener,noreferrer');
      responseToRequest(message.requestId, true);
      return;
    }
    if (message.request.type === 'clipboard.write') {
      if (!hasCapability('clipboard.write')) throw new Error('未声明 clipboard.write 权限');
      if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入');
      await navigator.clipboard.writeText(String(payload.text || '').slice(0, 4096));
      responseToRequest(message.requestId, true);
      return;
    }
    responseToRequest(message.requestId, '未知请求', false);
  } catch (error) {
    responseToRequest(message.requestId, error instanceof Error ? error.message : '请求失败', false);
  }
};

const handleMessage = (event: MessageEvent) => {
  if (!props.enabled || event.source !== iframeRef.value?.contentWindow || !canAcceptMessage()) return;
  const message = parseSandboxFrameMessage(event.data, nonce.value);
  if (!message) return;
  if (message.kind === 'ready') {
    status.value = 'ready';
    return;
  }
  if (message.kind === 'mounted') {
    status.value = 'mounted';
    window.clearTimeout(bootTimer);
    return;
  }
  if (message.kind === 'error') {
    status.value = 'error';
    errorMessage.value = message.payload?.message || 'Sandbox 运行错误';
    window.clearTimeout(bootTimer);
    return;
  }
  if (message.kind === 'request') {
    void handleRequest(message);
  }
};

watch(
    () => [props.enabled, props.definition.packageHash, props.tile.id, JSON.stringify(props.tile.settings)],
    () => resetFrame(),
);

onMounted(() => {
  window.addEventListener('message', handleMessage);
  resetFrame();
});

onBeforeUnmount(() => {
  postToFrame({kind: 'unmount'});
  window.removeEventListener('message', handleMessage);
  window.clearTimeout(bootTimer);
});
</script>

<template>
  <article class="sandbox-tile w-full h-full min-w-0 min-h-0" :data-package="definition.id">
    <div v-if="!enabled" class="sandbox-placeholder">
      <strong>{{ definition.label }}</strong>
      <span>Sandbox JS 本机实验未启用。</span>
    </div>

    <template v-else>
      <iframe
          ref="iframeRef"
          class="sandbox-frame"
          :key="nonce"
          :srcdoc="srcDoc"
          sandbox="allow-scripts"
          :title="definition.label"
          referrerpolicy="no-referrer"
      ></iframe>

      <div v-if="status === 'booting' || status === 'ready'" class="sandbox-status">
        <span>启动中</span>
      </div>

      <div v-if="status === 'error'" class="sandbox-placeholder sandbox-error" role="status">
        <strong>{{ definition.label }}</strong>
        <span>{{ errorMessage || 'Sandbox 运行错误' }}</span>
        <button type="button" @click="resetFrame">重载</button>
      </div>
    </template>
  </article>
</template>

<style scoped>
.sandbox-tile {
  position: relative;
  overflow: hidden;
  border-radius: var(--tile-radius, 18px);
  background:
      linear-gradient(135deg, color-mix(in srgb, var(--tile-surface) 30%, transparent), transparent),
      rgba(var(--overlay-rgb), 0.12);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  color: var(--text-primary);
}

.sandbox-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  border: 0;
  background: transparent;
}

.sandbox-placeholder,
.sandbox-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  text-align: center;
  background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 14%, transparent), transparent 46%),
      rgba(var(--overlay-rgb), 0.10);
}

.sandbox-placeholder strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tile-accent-color, var(--accent-color));
  font-size: 13px;
  font-weight: 900;
}

.sandbox-placeholder span,
.sandbox-status span {
  max-width: 100%;
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.68;
  overflow-wrap: anywhere;
}

.sandbox-error {
  background: rgba(127, 29, 29, 0.18);
}

.sandbox-error button {
  height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
  color: white;
  background: var(--tile-accent-color, var(--accent-color));
}
</style>
