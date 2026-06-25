<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {PhGear, PhSpinner, PhWarning, PhX} from '@phosphor-icons/vue';
import type {
  ComponentTile,
  DeclarativeAction,
  DeclarativeTileDefinition,
  JsonValue,
} from '../../../core/tiles/contracts.ts';
import {useConfigStore} from '../../../stores/useConfigStore.ts';
import {useToast} from '../../../shared/composables/useToast.ts';
import {useTileSizeContext} from '../../../core/tiles/context.ts';
import {
  createDeclarativeDataContext,
  normalizeDeclarativeUrl,
  resolveDeclarativeText,
  resolveDeclarativeValue,
  toggleDeclarativeSettingPath,
} from '../../../core/tiles/declarativeData.ts';
import {
  listSettingsSchemaFields,
  normalizeTileSettingsWithSchema,
  type TileSettingsField,
} from '../../../core/tiles/settingsSchema.ts';
import DeclarativeViewNode from './DeclarativeViewNode.vue';

const props = defineProps<{
  tile: ComponentTile;
  definition: DeclarativeTileDefinition;
}>();

type RuntimeStatus = 'ready' | 'loading' | 'error';

const store = useConfigStore();
const toast = useToast();
const sizeContext = useTileSizeContext();
const activeDialogView = ref('');
const settingsOpen = ref(false);
const draftSettings = ref<Record<string, JsonValue>>({});
const runtimeStatus = ref<RuntimeStatus>('ready');
const runtimeMessage = ref('');
const lastRefreshAt = ref(Date.now());

const settingsFields = computed(() => listSettingsSchemaFields(props.definition.settingsSchema));
const normalizedSettings = computed(() => normalizeTileSettingsWithSchema(
    props.tile.settings,
    props.definition.settingsSchema,
    {defaults: props.definition.defaultSettings},
));
const settingsIssues = computed(() => normalizedSettings.value.issues);
const effectiveTile = computed(() => ({
  ...props.tile,
  settings: normalizedSettings.value.settings,
}));
const dataContext = computed(() => createDeclarativeDataContext(
    effectiveTile.value,
    {
      status: runtimeStatus.value,
      refreshedAt: lastRefreshAt.value,
    },
    lastRefreshAt.value,
));
const coverNode = computed(() => props.definition.views[props.definition.renderer.coverView]);
const dialogNode = computed(() => {
  const view = activeDialogView.value || props.definition.renderer.dialogView || '';
  return view ? props.definition.views[view] : null;
});
const mobileState = computed(() => {
  if (sizeContext.value.profile !== 'mobile') return {blocked: false, notice: ''};
  if (props.definition.compatibility.mobileSupport === 'desktop-only') {
    return {blocked: true, notice: '该组件未提供移动端布局，请在桌面视图打开。'};
  }
  if (props.definition.compatibility.mobileSupport === 'fallback-layout') {
    return {blocked: false, notice: '正在使用移动端降级布局。'};
  }
  return {blocked: false, notice: ''};
});
const canRenderCover = computed(() => !!coverNode.value && !mobileState.value.blocked);
const dialogTitle = computed(() => {
  const node = dialogNode.value;
  if (!node || node.type !== 'dialog') return props.definition.label;
  return resolveDeclarativeText(node.title, dataContext.value) || props.definition.label;
});
const hasSettingsForm = computed(() => settingsFields.value.length > 0);

watch(settingsOpen, (open) => {
  if (open) draftSettings.value = {...normalizedSettings.value.settings};
});

const showRuntimeError = (message: string) => {
  runtimeStatus.value = 'error';
  runtimeMessage.value = message;
};

const saveSettings = (settings: Record<string, JsonValue>) => {
  const result = store.updateComponentTileSettings(props.tile.id, settings);
  if (!result.success) {
    showRuntimeError(result.issues[0]?.message || '设置保存失败');
    toast.error(result.issues[0]?.message || '设置保存失败');
    return false;
  }
  if (result.issues.length) toast.warning(result.issues[0].message);
  return true;
};

const copyTextToClipboard = async (text: string) => {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  if (typeof document === 'undefined') return false;
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', 'true');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  return copied;
};

const handleAction = async (action: DeclarativeAction) => {
  try {
    if (action.type === 'openUrl') {
      const url = normalizeDeclarativeUrl(resolveDeclarativeText(action.url, dataContext.value));
      if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
      else showRuntimeError('链接无效或不被允许');
      return;
    }
    if (action.type === 'dialog') {
      activeDialogView.value = action.view || props.definition.renderer.dialogView || '';
      return;
    }
    if (action.type === 'refresh') {
      runtimeStatus.value = 'loading';
      runtimeMessage.value = '';
      lastRefreshAt.value = Date.now();
      window.setTimeout(() => {
        runtimeStatus.value = 'ready';
      }, 180);
      return;
    }
    if (action.type === 'copyText') {
      const copied = await copyTextToClipboard(resolveDeclarativeText(action.text, dataContext.value));
      if (copied) toast.success('已复制');
      else showRuntimeError('复制失败');
      return;
    }
    if (action.type === 'toggleSetting') {
      if (!action.path) {
        showRuntimeError('设置路径无效');
        return;
      }
      const explicitValue = action.value !== undefined
          ? resolveDeclarativeValue(action.value, dataContext.value)
          : undefined;
      const nextSettings = toggleDeclarativeSettingPath(normalizedSettings.value.settings, action.path, explicitValue);
      if (saveSettings(nextSettings)) runtimeStatus.value = 'ready';
    }
  } catch (error) {
    showRuntimeError(error instanceof Error ? error.message : '组件动作执行失败');
  }
};

const fieldValue = (field: TileSettingsField) => draftSettings.value[field.key] ?? field.defaultValue;

const enumLabel = (value: JsonValue) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);

const updateDraftField = (field: TileSettingsField, event: Event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target) return;
  if (field.type === 'boolean') {
    draftSettings.value = {...draftSettings.value, [field.key]: (target as HTMLInputElement).checked};
    return;
  }
  if (field.type === 'number') {
    const numeric = Number(target.value);
    draftSettings.value = {...draftSettings.value, [field.key]: Number.isFinite(numeric) ? numeric : field.defaultValue};
    return;
  }
  if (field.type === 'select') {
    const selected = field.enum?.find((entry) => enumLabel(entry) === target.value);
    draftSettings.value = {...draftSettings.value, [field.key]: selected ?? field.defaultValue};
    return;
  }
  draftSettings.value = {...draftSettings.value, [field.key]: target.value};
};

const saveDraftSettings = () => {
  const normalized = normalizeTileSettingsWithSchema(
      draftSettings.value,
      props.definition.settingsSchema,
      {defaults: props.definition.defaultSettings},
  );
  if (!saveSettings(normalized.settings)) return;
  settingsOpen.value = false;
  runtimeStatus.value = 'ready';
};
</script>

<template>
  <article
      class="decl-tile w-full h-full min-w-0 min-h-0"
      :class="[`decl-status-${runtimeStatus}`, mobileState.blocked ? 'decl-mobile-blocked' : '']"
      :data-package="definition.id"
  >
    <button
        v-if="hasSettingsForm"
        type="button"
        class="decl-settings-btn"
        title="组件设置"
        aria-label="组件设置"
        @click.stop="settingsOpen = true"
    >
      <PhGear size="15" weight="bold"/>
    </button>

    <div v-if="mobileState.notice && !mobileState.blocked" class="decl-notice">
      {{ mobileState.notice }}
    </div>

    <div v-if="runtimeStatus === 'loading'" class="decl-state decl-loading" role="status">
      <PhSpinner class="animate-spin" size="20" weight="bold"/>
    </div>

    <div v-if="runtimeStatus === 'error'" class="decl-state decl-error" role="alert">
      <PhWarning size="18" weight="fill"/>
      <span>{{ runtimeMessage || '组件状态异常' }}</span>
      <button type="button" @click.stop="runtimeStatus = 'ready'">恢复</button>
    </div>

    <div v-if="settingsIssues.length" class="decl-schema-warning" role="status">
      <PhWarning size="14" weight="fill"/>
      <span>{{ settingsIssues[0].message }}</span>
    </div>

    <div v-if="mobileState.blocked" class="decl-empty">
      <strong>{{ definition.label }}</strong>
      <span>{{ mobileState.notice }}</span>
    </div>

    <DeclarativeViewNode
        v-else-if="canRenderCover"
        :node="coverNode"
        :context="dataContext"
        @action="handleAction"
    />
    <div v-else class="decl-empty">
      <strong>{{ definition.label }}</strong>
      <span>缺少声明式 coverView，实例数据已保留。</span>
    </div>

    <div v-if="settingsOpen" class="decl-dialog-backdrop" @click.self="settingsOpen = false">
      <section class="decl-dialog decl-settings-dialog" role="dialog" aria-modal="true" :aria-label="`${definition.label} 设置`">
        <div class="decl-dialog-head">
          <strong>{{ definition.label }}</strong>
          <button type="button" class="decl-dialog-close" aria-label="关闭" @click="settingsOpen = false">
            <PhX size="16" weight="bold"/>
          </button>
        </div>
        <div class="decl-settings-body">
          <label
              v-for="field in settingsFields"
              :key="field.key"
              class="decl-settings-field"
          >
            <span class="decl-settings-label">{{ field.label }}</span>
            <span v-if="field.description" class="decl-settings-desc">{{ field.description }}</span>

            <input
                v-if="field.type === 'string'"
                class="decl-settings-input"
                type="text"
                :maxlength="field.maxLength"
                :value="fieldValue(field)"
                @input="updateDraftField(field, $event)"
            />
            <input
                v-else-if="field.type === 'number'"
                class="decl-settings-input"
                type="number"
                :min="field.min"
                :max="field.max"
                :step="field.step || 1"
                :value="fieldValue(field)"
                @input="updateDraftField(field, $event)"
            />
            <select
                v-else-if="field.type === 'select'"
                class="decl-settings-input"
                :value="enumLabel(fieldValue(field))"
                @change="updateDraftField(field, $event)"
            >
              <option v-for="option in field.enum" :key="enumLabel(option)" :value="enumLabel(option)">
                {{ enumLabel(option) }}
              </option>
            </select>
            <input
                v-else
                class="decl-settings-toggle"
                type="checkbox"
                :checked="fieldValue(field) === true"
                @change="updateDraftField(field, $event)"
            />
          </label>

          <div v-if="settingsIssues.length" class="decl-settings-issues">
            {{ settingsIssues[0].message }}
          </div>
        </div>
        <div class="decl-settings-actions">
          <button type="button" class="decl-settings-secondary" @click="settingsOpen = false">取消</button>
          <button type="button" class="decl-settings-primary" @click="saveDraftSettings">保存</button>
        </div>
      </section>
    </div>

    <div v-if="dialogNode" class="decl-dialog-backdrop" @click.self="activeDialogView = ''">
      <section class="decl-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
        <div class="decl-dialog-head">
          <strong>{{ dialogTitle }}</strong>
          <button type="button" class="decl-dialog-close" aria-label="关闭" @click="activeDialogView = ''">
            <PhX size="16" weight="bold"/>
          </button>
        </div>
        <div class="decl-dialog-body">
          <DeclarativeViewNode
              :node="dialogNode"
              :context="dataContext"
              @action="handleAction"
          />
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.decl-tile {
  position: relative;
  container-type: size;
  display: grid;
  align-content: stretch;
  padding: clamp(10px, 5cqi, 18px);
  overflow: hidden;
  border-radius: var(--tile-radius, 18px);
  color: var(--text-primary);
  background:
      linear-gradient(135deg, color-mix(in srgb, var(--tile-surface) 34%, transparent), transparent),
      radial-gradient(circle at top right, color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 20%, transparent), transparent 44%),
      rgba(var(--overlay-rgb), 0.11);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  box-shadow:
      0 calc(var(--tile-elevation, 1) * 8px) calc(var(--tile-elevation, 1) * 18px) rgba(15, 23, 42, 0.13);
}

.decl-mobile-blocked {
  border-style: dashed;
}

.decl-settings-btn {
  position: absolute;
  top: 9px;
  right: 9px;
  z-index: 24;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  background: rgba(var(--overlay-rgb), 0.18);
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  opacity: 0.68;
  transition: opacity .14s ease, background .14s ease, color .14s ease;
}

.decl-tile:hover .decl-settings-btn,
.decl-settings-btn:focus-visible {
  opacity: 1;
}

.decl-settings-btn:hover,
.decl-settings-btn:focus-visible {
  color: var(--tile-accent-color, var(--accent-color));
  background: rgba(var(--overlay-rgb), 0.26);
  outline: none;
}

.decl-notice,
.decl-schema-warning {
  position: absolute;
  left: 10px;
  right: 46px;
  top: 10px;
  z-index: 22;
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: rgb(217 119 6);
  border: 1px solid rgba(245, 158, 11, 0.22);
  font-size: 10px;
  line-height: 1.25;
  font-weight: 800;
  pointer-events: none;
}

.decl-schema-warning {
  top: auto;
  right: 10px;
  bottom: 10px;
}

.decl-state {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: rgba(var(--overlay-rgb), 0.22);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: var(--text-primary);
}

.decl-error {
  flex-direction: column;
  text-align: center;
  font-size: 11px;
  line-height: 1.35;
}

.decl-error button {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 9px;
  color: white;
  background: var(--tile-accent-color, var(--accent-color));
  font-size: 11px;
  font-weight: 900;
}

.decl-empty {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  opacity: 0.72;
}

.decl-empty strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tile-accent-color, var(--accent-color));
}

.decl-empty span {
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.decl-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.decl-dialog {
  width: min(100%, 360px);
  max-height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: calc(var(--tile-radius, 18px) + 2px);
  border: 1px solid rgba(var(--overlay-rgb), 0.24);
  background: color-mix(in srgb, var(--modal-bg, #101014) 92%, transparent);
  color: var(--modal-text, var(--text-primary));
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.32);
}

.decl-dialog-head {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(var(--overlay-rgb), 0.14);
}

.decl-dialog-head strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decl-dialog-close {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--overlay-rgb), 0.10);
  flex: 0 0 auto;
}

.decl-dialog-body {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.decl-settings-dialog {
  width: min(100%, 380px);
}

.decl-settings-body {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.decl-settings-field {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border-radius: 12px;
  background: rgba(var(--overlay-rgb), 0.08);
  border: 1px solid rgba(var(--overlay-rgb), 0.10);
}

.decl-settings-label {
  font-size: 11px;
  line-height: 1.2;
  font-weight: 900;
}

.decl-settings-desc {
  font-size: 10px;
  line-height: 1.35;
  opacity: 0.58;
}

.decl-settings-input {
  width: 100%;
  min-width: 0;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(var(--overlay-rgb), 0.18);
  background: rgba(var(--overlay-rgb), 0.10);
  padding: 0 10px;
  font-size: 12px;
  outline: none;
}

.decl-settings-input:focus {
  border-color: color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 48%, transparent);
}

.decl-settings-toggle {
  width: 18px;
  height: 18px;
  accent-color: var(--tile-accent-color, var(--accent-color));
}

.decl-settings-issues {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  color: rgb(217 119 6);
  font-size: 11px;
  line-height: 1.4;
  font-weight: 800;
}

.decl-settings-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(var(--overlay-rgb), 0.14);
}

.decl-settings-primary,
.decl-settings-secondary {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
}

.decl-settings-primary {
  color: white;
  background: var(--tile-accent-color, var(--accent-color));
}

.decl-settings-secondary {
  background: rgba(var(--overlay-rgb), 0.12);
}
</style>
