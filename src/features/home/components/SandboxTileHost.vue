<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import type {SandboxRuntimePermission} from '../../../core/config/types.ts';
import type {ComponentTile, JsonValue, SandboxTileDefinition} from '../../../core/tiles/contracts.ts';
import {normalizeDeclarativeUrl} from '../../../core/tiles/declarativeData.ts';
import {getCurrentHostCapabilities} from '../../../core/tiles/hostCapabilities.ts';
import {
  DEFAULT_SANDBOX_LIMITS,
  getSandboxFuseState,
  hasSandboxPermission,
  isSandboxNetworkUrlAllowed,
  listMissingSandboxPermissions,
  listSandboxRequiredPermissions,
  registerSandboxInstance,
  unregisterSandboxInstance,
} from '../../../core/tiles/sandboxRuntime.ts';
import {
  buildSandboxSrcDoc,
  createSandboxNonce,
  parseSandboxFrameMessage,
  SANDBOX_BRIDGE_CHANNEL,
  type SandboxFrameMessage,
} from '../../../core/tiles/sandboxBridge.ts';
import {useConfigStore} from '../../../stores/useConfigStore.ts';

const props = defineProps<{
  tile: ComponentTile;
  definition: SandboxTileDefinition;
  enabled: boolean;
}>();

const permissionCopy: Record<SandboxRuntimePermission, {label: string; detail: string}> = {
  storage: {label: '实例存储', detail: '读写该组件实例自己的本地小容量数据'},
  network: {label: '网络代理', detail: '通过宿主访问清单声明的网络域名'},
  openExternal: {label: '打开外链', detail: '在新标签页打开经过校验的 URL'},
  'clipboard.write': {label: '写入剪贴板', detail: '把组件生成的文本写入系统剪贴板'},
  notifications: {label: '系统通知', detail: '在浏览器授权后发送本地通知'},
};

const store = useConfigStore();
const rootRef = ref<HTMLElement | null>(null);
const iframeRef = ref<HTMLIFrameElement | null>(null);
const nonce = ref(createSandboxNonce());
const status = ref<'blocked' | 'booting' | 'ready' | 'mounted' | 'error'>('booting');
const errorMessage = ref('');
const instanceBlockedMessage = ref('');
const documentVisible = ref(typeof document === 'undefined' ? true : !document.hidden);
const isIntersecting = ref(true);
const paused = ref(false);
const messageTimes: number[] = [];
const requestTimes: number[] = [];

let bootTimer = 0;
let instanceRegistered = false;
let intersectionObserver: IntersectionObserver | null = null;

const sandboxRuntime = computed(() => store.config.runtime?.sandbox || {enabled: false});
const limits = computed(() => ({
  ...DEFAULT_SANDBOX_LIMITS,
  ...(sandboxRuntime.value.limits || {}),
}));
const requiredPermissions = computed(() => listSandboxRequiredPermissions(props.definition));
const missingPermissions = computed(() =>
    listMissingSandboxPermissions(props.definition, sandboxRuntime.value.grants, props.tile.id),
);
const missingPermissionItems = computed(() =>
    missingPermissions.value.map((permission) => ({permission, ...permissionCopy[permission]})),
);
const fuseState = computed(() => getSandboxFuseState(sandboxRuntime.value.crashes, props.tile.id));
const fuseUntilLabel = computed(() =>
    fuseState.value.fused && fuseState.value.until
        ? new Date(fuseState.value.until).toLocaleString()
        : '',
);
const shouldRenderFrame = computed(() =>
    props.enabled
    && missingPermissions.value.length === 0
    && !fuseState.value.fused
    && !instanceBlockedMessage.value,
);
const hostCapabilities = computed(() => getCurrentHostCapabilities({sandboxRuntime: props.enabled}));
const srcDoc = computed(() => buildSandboxSrcDoc({
  definition: props.definition,
  tile: props.tile,
  nonce: nonce.value,
  host: hostCapabilities.value,
}));
const storagePrefix = computed(() => `voidtab:sandbox-storage:v1:${props.definition.id}:${props.tile.id}:`);
const shouldPauseFrame = computed(() => !documentVisible.value || !isIntersecting.value);

const releaseInstance = () => {
  if (!instanceRegistered) return;
  unregisterSandboxInstance(props.tile.id);
  instanceRegistered = false;
};

const ensureInstanceRegistration = () => {
  if (instanceRegistered) return true;
  const result = registerSandboxInstance(props.tile.id, limits.value);
  if (!result.ok) {
    instanceBlockedMessage.value = result.message || 'Sandbox 实例数量已达上限';
    status.value = 'blocked';
    return false;
  }
  instanceRegistered = true;
  instanceBlockedMessage.value = '';
  return true;
};

const markSandboxCrash = (reason: string) => {
  store.recordSandboxCrash(props.tile.id, reason);
};

const resetFrame = () => {
  window.clearTimeout(bootTimer);
  errorMessage.value = '';
  instanceBlockedMessage.value = '';
  paused.value = false;

  if (!props.enabled || missingPermissions.value.length > 0 || fuseState.value.fused) {
    releaseInstance();
    status.value = 'blocked';
    return;
  }

  if (!ensureInstanceRegistration()) return;

  nonce.value = createSandboxNonce();
  status.value = 'booting';
  bootTimer = window.setTimeout(() => {
    if (status.value !== 'mounted' && status.value !== 'error') {
      status.value = 'error';
      errorMessage.value = 'Sandbox 启动超时';
      markSandboxCrash('Sandbox 启动超时');
      releaseInstance();
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

const assertRequestBudget = () => {
  const now = Date.now();
  while (requestTimes.length && now - requestTimes[0] > 60_000) requestTimes.shift();
  if (requestTimes.length >= limits.value.maxRequestsPerMinute) {
    throw new Error(`Sandbox 请求频率超过每分钟 ${limits.value.maxRequestsPerMinute} 次`);
  }
  requestTimes.push(now);
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

const hasGrantedPermission = (permission: SandboxRuntimePermission) =>
    hasSandboxPermission(props.definition, sandboxRuntime.value.grants, props.tile.id, permission);

const byteLength = (value: string) => {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
};

const cloneJsonValue = (value: unknown): JsonValue => {
  const source = JSON.stringify(value);
  if (!source || byteLength(source) > 8192) return null;
  return JSON.parse(source) as JsonValue;
};

const normalizeStorageKey = (key: unknown) => {
  if (typeof key !== 'string') return '';
  const value = key.trim();
  if (!/^[a-z0-9._:-]{1,80}$/i.test(value)) return '';
  return value;
};

const measureStorageBytes = (key: string, nextSerialized: string | null) => {
  const fullKey = storagePrefix.value + key;
  let total = 0;
  let seen = false;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey || !storageKey.startsWith(storagePrefix.value)) continue;
    if (storageKey === fullKey) {
      seen = true;
      if (nextSerialized !== null) total += byteLength(storageKey) + byteLength(nextSerialized);
      continue;
    }
    total += byteLength(storageKey) + byteLength(window.localStorage.getItem(storageKey) || '');
  }

  if (!seen && nextSerialized !== null) total += byteLength(fullKey) + byteLength(nextSerialized);
  return total;
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
  if (!serialized || byteLength(serialized) > 8192) throw new Error('storage value too large');
  if (measureStorageBytes(key, serialized) > limits.value.maxStorageBytes) {
    throw new Error(`storage quota exceeded: ${limits.value.maxStorageBytes} bytes`);
  }
  window.localStorage.setItem(storagePrefix.value + key, serialized);
  return true;
};

const removeStorageItem = (key: string) => {
  window.localStorage.removeItem(storagePrefix.value + key);
  return true;
};

const fetchThroughHost = async (payload: Record<string, unknown>) => {
  if (!hasGrantedPermission('network')) throw new Error('未授权 network 权限');
  const url = typeof payload.url === 'string' ? payload.url : '';
  if (!isSandboxNetworkUrlAllowed(props.definition, url)) throw new Error('网络域名未在组件清单中声明');

  const init = payload.init && typeof payload.init === 'object' && !Array.isArray(payload.init)
      ? payload.init as Record<string, unknown>
      : {};
  const method = typeof init.method === 'string' ? init.method.toUpperCase() : 'GET';
  if (method !== 'GET' && method !== 'HEAD') throw new Error('Sandbox 网络代理仅支持 GET/HEAD');

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: {Accept: 'application/json,text/plain,*/*'},
    });
    const body = method === 'HEAD' ? '' : await response.text();
    if (byteLength(body) > limits.value.maxNetworkBytesPerRequest) {
      throw new Error(`网络响应超过 ${limits.value.maxNetworkBytesPerRequest} bytes`);
    }
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      headers: {
        contentType: response.headers.get('content-type') || '',
      },
      body,
    };
  } finally {
    window.clearTimeout(timer);
  }
};

const showNotification = async (payload: Record<string, unknown>) => {
  if (!hasGrantedPermission('notifications')) throw new Error('未授权 notifications 权限');
  if (typeof Notification === 'undefined') throw new Error('当前环境不支持通知');
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') throw new Error('通知权限未授予');

  const options = payload.options && typeof payload.options === 'object' && !Array.isArray(payload.options)
      ? payload.options as Record<string, unknown>
      : {};
  const title = String(payload.title || props.definition.label).slice(0, 80);
  const body = typeof options.body === 'string' ? options.body.slice(0, 240) : undefined;
  const tag = typeof options.tag === 'string' ? `voidtab-sandbox:${props.tile.id}:${options.tag.slice(0, 64)}` : undefined;
  new Notification(title, {
    ...(body ? {body} : {}),
    ...(tag ? {tag} : {}),
  });
  return true;
};

const handleRequest = async (message: Extract<SandboxFrameMessage, {kind: 'request'}>) => {
  const payload = message.request.payload && typeof message.request.payload === 'object'
      ? message.request.payload as Record<string, unknown>
      : {};
  try {
    assertRequestBudget();
    if (message.request.type === 'storage.get') {
      if (!hasGrantedPermission('storage')) throw new Error('未授权 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, getStorageItem(key));
      return;
    }
    if (message.request.type === 'storage.set') {
      if (!hasGrantedPermission('storage')) throw new Error('未授权 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, setStorageItem(key, payload.value));
      return;
    }
    if (message.request.type === 'storage.remove') {
      if (!hasGrantedPermission('storage')) throw new Error('未授权 storage 权限');
      const key = normalizeStorageKey(payload.key);
      if (!key) throw new Error('storage key 无效');
      responseToRequest(message.requestId, removeStorageItem(key));
      return;
    }
    if (message.request.type === 'openUrl') {
      if (!hasGrantedPermission('openExternal')) throw new Error('未授权 openExternal 权限');
      const url = normalizeDeclarativeUrl(typeof payload.url === 'string' ? payload.url : '');
      if (!url) throw new Error('URL 无效');
      window.open(url, '_blank', 'noopener,noreferrer');
      responseToRequest(message.requestId, true);
      return;
    }
    if (message.request.type === 'clipboard.write') {
      if (!hasGrantedPermission('clipboard.write')) throw new Error('未授权 clipboard.write 权限');
      if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入');
      await navigator.clipboard.writeText(String(payload.text || '').slice(0, 4096));
      responseToRequest(message.requestId, true);
      return;
    }
    if (message.request.type === 'network.fetch') {
      responseToRequest(message.requestId, await fetchThroughHost(payload));
      return;
    }
    if (message.request.type === 'notification.show') {
      responseToRequest(message.requestId, await showNotification(payload));
      return;
    }
    responseToRequest(message.requestId, '未知请求', false);
  } catch (error) {
    responseToRequest(message.requestId, error instanceof Error ? error.message : '请求失败', false);
  }
};

const syncPauseState = () => {
  if (!shouldRenderFrame.value || status.value !== 'mounted') return;
  const nextPaused = shouldPauseFrame.value;
  if (paused.value === nextPaused) return;
  paused.value = nextPaused;
  postToFrame({kind: nextPaused ? 'pause' : 'resume'});
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
    syncPauseState();
    return;
  }
  if (message.kind === 'error') {
    status.value = 'error';
    errorMessage.value = message.payload?.message || 'Sandbox 运行错误';
    markSandboxCrash(errorMessage.value);
    releaseInstance();
    window.clearTimeout(bootTimer);
    return;
  }
  if (message.kind === 'request') {
    void handleRequest(message);
  }
};

const grantRequiredPermissions = () => {
  store.grantSandboxPermissions(props.tile.id, requiredPermissions.value);
  resetFrame();
};

const clearFuse = () => {
  store.clearSandboxCrash(props.tile.id);
  resetFrame();
};

const handleVisibilityChange = () => {
  documentVisible.value = !document.hidden;
  syncPauseState();
};

watch(
    () => [
      props.enabled,
      props.definition.packageHash,
      props.tile.id,
      JSON.stringify(props.tile.settings),
      missingPermissions.value.join('|'),
      fuseState.value.fused ? String(fuseState.value.until || '') : '',
      limits.value.maxActiveInstances,
    ],
    () => resetFrame(),
);

watch(shouldPauseFrame, () => syncPauseState());

onMounted(() => {
  window.addEventListener('message', handleMessage);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (typeof IntersectionObserver !== 'undefined' && rootRef.value) {
    intersectionObserver = new IntersectionObserver((entries) => {
      isIntersecting.value = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
      syncPauseState();
    }, {threshold: 0.01});
    intersectionObserver.observe(rootRef.value);
  }
  resetFrame();
});

onBeforeUnmount(() => {
  postToFrame({kind: 'unmount'});
  releaseInstance();
  window.removeEventListener('message', handleMessage);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  intersectionObserver?.disconnect();
  window.clearTimeout(bootTimer);
});
</script>

<template>
  <article ref="rootRef" class="sandbox-tile w-full h-full min-w-0 min-h-0" :data-package="definition.id">
    <div v-if="!enabled" class="sandbox-placeholder">
      <strong>{{ definition.label }}</strong>
      <span>Sandbox JS 本机实验未启用。</span>
    </div>

    <div v-else-if="missingPermissions.length" class="sandbox-placeholder sandbox-permissions" role="status">
      <strong>{{ definition.label }}</strong>
      <span>运行前需要确认此实例的能力授权。</span>
      <ul class="permission-list">
        <li v-for="item in missingPermissionItems" :key="item.permission">
          <b>{{ item.label }}</b>
          <small>{{ item.detail }}</small>
        </li>
      </ul>
      <div class="sandbox-actions">
        <button type="button" class="primary-btn" @click="grantRequiredPermissions">授权运行</button>
      </div>
    </div>

    <div v-else-if="fuseState.fused" class="sandbox-placeholder sandbox-error" role="status">
      <strong>{{ definition.label }}</strong>
      <span>{{ fuseState.reason || 'Sandbox 重复崩溃，已临时熔断' }}</span>
      <span v-if="fuseUntilLabel">恢复时间：{{ fuseUntilLabel }}</span>
      <button type="button" @click="clearFuse">清除熔断</button>
    </div>

    <div v-else-if="instanceBlockedMessage" class="sandbox-placeholder sandbox-error" role="status">
      <strong>{{ definition.label }}</strong>
      <span>{{ instanceBlockedMessage }}</span>
      <button type="button" @click="resetFrame">重试</button>
    </div>

    <template v-else>
      <iframe
          v-if="shouldRenderFrame"
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

.sandbox-permissions {
  justify-content: flex-start;
  padding-top: 18px;
  overflow: auto;
}

.permission-list {
  width: min(100%, 260px);
  display: grid;
  gap: 6px;
  margin: 4px 0;
  padding: 0;
  list-style: none;
}

.permission-list li {
  min-width: 0;
  display: grid;
  gap: 2px;
  padding: 7px 9px;
  border-radius: 10px;
  border: 1px solid rgba(var(--overlay-rgb), 0.16);
  background: rgba(var(--overlay-rgb), 0.10);
  text-align: left;
}

.permission-list b {
  font-size: 11px;
  line-height: 1.2;
}

.permission-list small {
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.62;
}

.sandbox-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.sandbox-error button,
.primary-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
  color: white;
  background: var(--tile-accent-color, var(--accent-color));
}
</style>
