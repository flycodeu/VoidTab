<script setup lang="ts">
import {computed} from 'vue';
import type {DeclarativeAction, DeclarativeViewNode} from '../../../core/tiles/contracts.ts';
import type {DeclarativeDataContext} from '../../../core/tiles/declarativeData.ts';
import {
  formatDeclarativeDate,
  formatDeclarativeNumber,
  formatDeclarativeRelativeTime,
  normalizeDeclarativeUrl,
  resolveDeclarativeBoolean,
  resolveDeclarativeText,
  resolveDeclarativeValue,
} from '../../../core/tiles/declarativeData.ts';
import {resolvePhosphorIcon} from '../../../shared/icons/phosphorIconMap.ts';

defineOptions({name: 'DeclarativeViewNode'});

const props = defineProps<{
  node: DeclarativeViewNode;
  context: DeclarativeDataContext;
}>();

const emit = defineEmits<{
  (event: 'action', action: DeclarativeAction): void;
}>();

const hidden = computed(() => resolveDeclarativeBoolean(props.node.hidden, props.context));
const text = computed(() => {
  if (props.node.type === 'text') return resolveDeclarativeText(props.node.text, props.context);
  if (props.node.type === 'button') return resolveDeclarativeText(props.node.label, props.context);
  if (props.node.type === 'dialog') return resolveDeclarativeText(props.node.title, props.context);
  if (props.node.type === 'icon') return resolveDeclarativeText(props.node.label, props.context);
  return '';
});
const formattedValue = computed(() => {
  const node = props.node;
  if (node.type === 'number') {
    return formatDeclarativeNumber(resolveDeclarativeValue(node.value, props.context), props.context, {
      numberStyle: node.numberStyle,
      minimumFractionDigits: node.minimumFractionDigits,
      maximumFractionDigits: node.maximumFractionDigits,
    });
  }
  if (node.type === 'date') {
    return formatDeclarativeDate(resolveDeclarativeValue(node.value, props.context), props.context, {
      dateStyle: node.dateStyle,
      timeStyle: node.timeStyle,
    });
  }
  if (node.type === 'relative-time') {
    return formatDeclarativeRelativeTime(resolveDeclarativeValue(node.value, props.context), props.context);
  }
  return '';
});
const imageSrc = computed(() => props.node.type === 'image'
    ? normalizeDeclarativeUrl(resolveDeclarativeText(props.node.src, props.context))
    : '');
const imageAlt = computed(() => props.node.type === 'image'
    ? resolveDeclarativeText(props.node.alt, props.context)
    : '');
const iconName = computed(() => props.node.type === 'icon'
    ? resolveDeclarativeText(props.node.name, props.context)
    : 'SquaresFour');
const iconComponent = computed(() => resolvePhosphorIcon(iconName.value, 'SquaresFour'));
const containerStyle = computed(() => {
  const node = props.node;
  if (node.type === 'stack' || node.type === 'row' || node.type === 'column') {
    const direction = node.type === 'stack' ? (node.direction || 'column') : node.type;
    return {
      display: 'flex',
      flexDirection: direction,
      gap: `${node.gap ?? 10}px`,
      alignItems: node.align === 'stretch' ? 'stretch' : node.align || 'stretch',
    };
  }
  if (node.type === 'grid') {
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(${node.columns || 2}, minmax(0, 1fr))`,
      gap: `${node.gap ?? 10}px`,
    };
  }
  return {};
});
const imageStyle = computed(() => props.node.type === 'image'
    ? {
      objectFit: props.node.fit || 'cover',
      borderRadius: `${props.node.radius ?? 14}px`,
    }
    : {});
</script>

<template>
  <template v-if="!hidden">
    <p
        v-if="node.type === 'text'"
        class="decl-text"
        :class="[`decl-text-${node.variant || 'body'}`, `decl-align-${node.align || 'left'}`]"
    >
      {{ text }}
    </p>

    <p
        v-else-if="node.type === 'number' || node.type === 'date' || node.type === 'relative-time'"
        class="decl-text"
        :class="[`decl-text-${node.variant || 'body'}`, `decl-align-${node.align || 'left'}`]"
    >
      {{ formattedValue }}
    </p>

    <img
        v-else-if="node.type === 'image' && imageSrc"
        class="decl-image"
        :src="imageSrc"
        :alt="imageAlt"
        :style="imageStyle"
        loading="lazy"
        decoding="async"
    />

    <div
        v-else-if="node.type === 'icon'"
        class="decl-icon"
        :class="[`decl-icon-${node.tone || 'default'}`, `decl-icon-${node.size || 'md'}`]"
        :aria-label="text || iconName"
    >
      <component :is="iconComponent" weight="duotone"/>
      <span v-if="text" class="decl-icon-label">{{ text }}</span>
    </div>

    <button
        v-else-if="node.type === 'button'"
        type="button"
        class="decl-button"
        :class="`decl-button-${node.tone || 'primary'}`"
        @click.stop="emit('action', node.action)"
    >
      {{ text }}
    </button>

    <div
        v-else-if="node.type === 'spacer'"
        class="decl-spacer"
        :style="{flex: `0 0 ${node.size ?? 8}px`, height: `${node.size ?? 8}px`}"
        aria-hidden="true"
    />

    <div
        v-else-if="node.type === 'divider'"
        class="decl-divider"
        :class="`decl-divider-${node.orientation || 'horizontal'}`"
        role="separator"
    />

    <div
        v-else-if="node.type === 'stack' || node.type === 'grid' || node.type === 'row' || node.type === 'column'"
        class="decl-container"
        :style="containerStyle"
    >
      <DeclarativeViewNode
          v-for="(child, index) in node.children"
          :key="child.id || index"
          :node="child"
          :context="context"
          @action="emit('action', $event)"
      />
    </div>

    <section v-else-if="node.type === 'dialog'" class="decl-dialog-node">
      <h3 v-if="text" class="decl-dialog-title">{{ text }}</h3>
      <DeclarativeViewNode
          v-for="(child, index) in node.children"
          :key="child.id || index"
          :node="child"
          :context="context"
          @action="emit('action', $event)"
      />
    </section>
  </template>
</template>

<style scoped>
.decl-text {
  min-width: 0;
  margin: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.decl-text-title {
  font-size: 15px;
  line-height: 1.15;
  font-weight: 900;
}

.decl-text-body {
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.78;
}

.decl-text-caption {
  font-size: 10px;
  line-height: 1.3;
  opacity: 0.56;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 800;
}

.decl-text-metric {
  font-size: clamp(22px, 8cqi, 42px);
  line-height: 0.95;
  font-weight: 950;
  color: var(--tile-accent-color, var(--accent-color));
}

.decl-align-center {
  text-align: center;
}

.decl-align-right {
  text-align: right;
}

.decl-image {
  display: block;
  width: 100%;
  min-height: 0;
  aspect-ratio: 16 / 9;
  background: rgba(var(--overlay-rgb), 0.12);
}

.decl-icon {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-primary);
}

.decl-icon :deep(svg) {
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
}

.decl-icon-sm {
  font-size: 18px;
}

.decl-icon-md {
  font-size: 26px;
}

.decl-icon-lg {
  font-size: 36px;
}

.decl-icon-accent {
  color: var(--tile-accent-color, var(--accent-color));
}

.decl-icon-muted {
  opacity: 0.56;
}

.decl-icon-label {
  min-width: 0;
  font-size: 12px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decl-button {
  min-width: 0;
  min-height: 32px;
  padding: 0 12px;
  border-radius: calc(var(--tile-radius, 18px) * 0.55);
  font-size: 12px;
  font-weight: 900;
  transition: transform 0.14s ease, filter 0.14s ease, background 0.14s ease;
}

.decl-button:active {
  transform: scale(0.98);
}

.decl-button-primary {
  color: white;
  background: var(--tile-accent-color, var(--accent-color));
}

.decl-button-secondary {
  color: var(--tile-accent-color, var(--accent-color));
  background: color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tile-accent-color, var(--accent-color)) 20%, transparent);
}

.decl-button-ghost {
  color: var(--text-primary);
  background: rgba(var(--overlay-rgb), 0.12);
}

.decl-container {
  min-width: 0;
  min-height: 0;
}

.decl-spacer {
  min-width: 0;
}

.decl-divider {
  background: rgba(var(--overlay-rgb), 0.18);
  border: 0;
}

.decl-divider-horizontal {
  width: 100%;
  height: 1px;
}

.decl-divider-vertical {
  align-self: stretch;
  width: 1px;
  min-height: 12px;
}

.decl-dialog-node {
  display: grid;
  gap: 10px;
}

.decl-dialog-title {
  margin: 0;
  font-size: 14px;
  font-weight: 900;
}
</style>
