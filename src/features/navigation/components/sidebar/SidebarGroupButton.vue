<script setup lang="ts">
import {computed} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore.ts';
import {resolvePhosphorIcon} from '../../../../shared/icons/phosphorIconMap';

interface GroupProps {
  id: string;
  title: string;
  icon: string;
  items?: any[];
  iconColor?: string;
  iconBgColor?: string;
}

const props = defineProps<{
  group: GroupProps;
  active: boolean;
  isDragging: boolean;
  showDropHint: boolean;
  breathingLight: boolean;
  orientation?: 'vertical' | 'horizontal';

  onSelect: (groupId: string) => void;
  onContextMenu: (e: MouseEvent, group: any) => void;
  onDragEnter: (groupId: string) => void;
  onDragLeave: () => void;
  onDrop: (groupId: string) => void;
}>();

const store = useConfigStore();

const IconComp = computed(() => {
  return resolvePhosphorIcon(props.group?.icon, 'SquaresFour');
});

const count = computed(() => props.group.items?.length || 0);
const dropHintId = computed(() => `group-${props.group.id}-drop-hint`);
const groupButtonLabel = computed(() => {
  return `${props.active ? '当前分组' : '打开分组'}：${props.group.title}，${count.value} 个项目`;
});

// 是否有自定义颜色
const hasCustomColor = computed(() => !!props.group.iconColor);

// 获取安全颜色
const safeColor = computed(() => props.group.iconColor || 'var(--accent-color)');

//   自定义色：仅改变文本/图标颜色，不改变背景
const buttonStyle = computed(() => {
  if (!hasCustomColor.value) return {};
  return {color: safeColor.value};
});

//   类名（不再用 bg-white/10 等固定色）
const dynamicClasses = computed(() => {
  const cls: string[] = ['sg-btn'];

  if (props.active) cls.push('is-active');
  else cls.push('is-idle');

  cls.push(props.orientation === 'horizontal' ? 'is-horizontal' : 'is-vertical');

  if (props.showDropHint) cls.push('is-drop-hint');
  if (props.breathingLight && props.active) cls.push('animate-pulse');

  // 默认（无自定义色）时，active 的文字用主题色
  if (props.active && !hasCustomColor.value) cls.push('text-accent');
  return cls;
});
</script>

<template>
  <button
      type="button"
      @click="onSelect(group.id)"
      @contextmenu="(e) => onContextMenu(e, group)"
      @dragenter.prevent="onDragEnter(group.id)"
      @dragleave.prevent="onDragLeave"
      @dragover.prevent
      @drop="onDrop(group.id)"
      :title="`${group.title} (${count})`"
      :aria-label="groupButtonLabel"
      :aria-current="active ? 'page' : undefined"
      :aria-describedby="showDropHint ? dropHintId : undefined"
      :class="dynamicClasses"
      :style="buttonStyle"
  >
    <!-- Edge 风格：左侧小指示条 -->
    <div
        v-if="active"
        class="active-indicator"
        :class="props.orientation === 'horizontal' ? 'active-indicator--horizontal' : ''"
        :style="{ backgroundColor: hasCustomColor ? safeColor : 'var(--accent-color)' }"
        aria-hidden="true"
    />

    <div class="relative">
      <component
          :is="IconComp"
          :size="props.orientation === 'horizontal' ? 28 : 26"
          :weight="active ? 'fill' : 'duotone'"
          class="icon"
          :class="[(!hasCustomColor && active) ? 'icon-glow' : '']"
          :style="hasCustomColor && active ? { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' } : {}"
          aria-hidden="true"
      />

      <transition name="scale">
        <div
            v-if="count > 0 && store.config.theme.showGroupCount"
            class="count-badge"
            :style="hasCustomColor ? { backgroundColor: safeColor, color: '#fff' } : {}"
            aria-hidden="true"
        >
          <span class="count-text">{{ count }}</span>
        </div>
      </transition>
    </div>

    <span class="title" :class="active ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'">
      {{ group.title }}
    </span>

    <span v-if="showDropHint" :id="dropHintId" class="sr-only">
      可将拖拽的网站放入此分组
    </span>
  </button>
</template>

<style scoped>
.sg-btn {
  position: relative;
  width: 100%;
  padding: 12px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;

  border-radius: 14px;
  border: 1px solid transparent;
  background: transparent;

  outline: none;
  user-select: none;

  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease, opacity 0.16s ease;

  /*   更贴合 sidebar 面板（不受 body 文本变量影响） */
  color: var(--sidebar-text);
}

.sg-btn.is-horizontal {
  width: 56px;
  min-width: 56px;
  height: 64px;
  padding: 8px 6px;
  gap: 4px;
  transform-origin: center bottom;
}

.is-idle {
  opacity: 0.78;
}

.is-idle:hover {
  opacity: 1;
  transform: translateY(-1px);
  border-color: rgba(var(--accent-color-rgb), 0.28);
  background: rgba(var(--accent-color-rgb), 0.06);
}

.is-active {
  opacity: 1;
  border-color: rgba(var(--accent-color-rgb), 0.45);
  background: rgba(var(--accent-color-rgb), 0.10);
  box-shadow: 0 0 0 1px rgba(var(--accent-color-rgb), 0.06) inset;
}

.is-active:hover {
  border-color: rgba(var(--accent-color-rgb), 0.55);
  background: rgba(var(--accent-color-rgb), 0.12);
}

.text-accent {
  color: var(--accent-color);
}

.is-drop-hint {
  opacity: 1 !important;
  border-style: dashed !important;
  border-color: rgba(var(--accent-color-rgb), 0.60) !important;
  background: rgba(var(--accent-color-rgb), 0.12) !important;
}

.sg-btn:focus-visible {
  box-shadow: 0 0 0 4px rgba(var(--accent-color-rgb), 0.16);
}

.active-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 18px;
  width: 3px;
  border-radius: 999px;
  opacity: 0.95;
}

.active-indicator--horizontal {
  left: 50%;
  top: auto;
  bottom: 3px;
  width: 18px;
  height: 3px;
  transform: translateX(-50%);
}

.icon {
  transition: transform 0.16s ease;
}

.sg-btn:hover .icon {
  transform: scale(1.08);
}

.sg-btn.is-horizontal:hover .icon {
  transform: scale(1.2);
}

.icon-glow {
  filter: drop-shadow(0 0 5px rgba(var(--accent-color-rgb), 0.45));
}

.count-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;

  border: 1px solid rgba(127, 127, 127, 0.25);
  background: rgba(127, 127, 127, 0.22);

  /*   角标文字也用 sidebar 文本 */
  color: var(--sidebar-text);

  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  transition: transform 0.16s ease;
}

.sg-btn:hover .count-badge {
  transform: scale(1.06);
}

.count-text {
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}

.title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  max-width: 100%;
  padding: 0 4px;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.16s ease;

  /*   弱文本跟随 sidebar muted */
  color: var(--sidebar-text);
}

.is-horizontal .title {
  max-width: 52px;
  font-size: 9px;
  margin-top: 0;
}

@keyframes pulse-subtle {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--accent-color-rgb), 0);
  }
  50% {
    box-shadow: 0 0 10px 0 rgba(var(--accent-color-rgb), 0.18);
  }
}

.animate-pulse {
  animation: pulse-subtle 3s infinite ease-in-out;
}

.scale-enter-active, .scale-leave-active {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}

.scale-enter-from, .scale-leave-to {
  transform: scale(0);
  opacity: 0;
}
</style>
