<script setup lang="ts">
import { computed } from 'vue'
import { PhFolderOpen, PhPlus } from '@phosphor-icons/vue'

let emptyStateId = 0

const props = withDefaults(defineProps<{
  icon?: any
  title?: string
  description?: string
  actionLabel?: string
  actionIcon?: any
  secondaryActionLabel?: string
  ariaLabel?: string
  live?: 'off' | 'polite' | 'assertive'
}>(), {
  icon: PhFolderOpen,
  title: '暂无内容',
  description: '这里还没有任何内容',
  actionLabel: '',
  actionIcon: PhPlus,
  secondaryActionLabel: '',
  ariaLabel: '',
  live: 'polite'
})

const emit = defineEmits<{
  action: []
  secondaryAction: []
}>()

const IconComponent = computed(() => props.icon)
const ActionIconComponent = computed(() => props.actionIcon)
const instanceId = `empty-state-${++emptyStateId}`
const titleId = `${instanceId}-title`
const descriptionId = `${instanceId}-description`
const resolvedAriaLabel = computed(() => props.ariaLabel || props.title)
</script>

<template>
  <section
    class="empty-state"
    role="status"
    :aria-live="live"
    aria-atomic="true"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    :aria-label="resolvedAriaLabel"
  >
    <div class="empty-icon" aria-hidden="true">
      <component :is="IconComponent" :size="64" weight="thin" />
    </div>

    <h3 :id="titleId" class="empty-title">{{ title }}</h3>

    <p :id="descriptionId" class="empty-description">{{ description }}</p>

    <div v-if="actionLabel || secondaryActionLabel" class="empty-actions">
      <button
        v-if="actionLabel"
        @click="emit('action')"
        class="btn btn-primary"
        :aria-label="actionLabel"
      >
        <component :is="ActionIconComponent" :size="20" weight="bold" aria-hidden="true" />
        <span>{{ actionLabel }}</span>
      </button>

      <button
        v-if="secondaryActionLabel"
        @click="emit('secondaryAction')"
        class="btn btn-secondary"
        :aria-label="secondaryActionLabel"
      >
        <span>{{ secondaryActionLabel }}</span>
      </button>
    </div>

    <slot name="custom-actions" />
  </section>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  min-height: 300px;
}

.empty-icon {
  margin-bottom: 1.5rem;
  color: #9ca3af;
  opacity: 0.5;
}

.dark .empty-icon {
  color: #6b7280;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #1f2937;
}

.dark .empty-title {
  color: #f3f4f6;
}

.empty-description {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 2rem;
  max-width: 400px;
  line-height: 1.6;
}

.dark .empty-description {
  color: #9ca3af;
}

.empty-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: #1f2937;
}

.dark .btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #f3f4f6;
}

.btn-secondary:hover {
  background: rgba(0, 0, 0, 0.08);
}

.dark .btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
