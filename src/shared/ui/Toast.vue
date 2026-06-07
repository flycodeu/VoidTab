<script setup lang="ts">
import { useToast, type ToastMessage } from '../composables/useToast'
import { PhCheckCircle, PhWarning, PhInfo, PhX, PhXCircle } from '@phosphor-icons/vue'

const { toasts, remove, pause, resume, error: showError } = useToast()

function onMouseEnter(toast: ToastMessage) {
  pause(toast.id)
}

function onMouseLeave(toast: ToastMessage) {
  resume(toast.id)
}

// Toast 图标映射
const iconMap = {
  success: PhCheckCircle,
  error: PhXCircle,
  warning: PhWarning,
  info: PhInfo
}

// Toast 颜色映射
const colorMap = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500'
}

const typeLabelMap = {
  success: '成功',
  error: '错误',
  warning: '提醒',
  info: '通知'
}

function getToastRole(toast: ToastMessage) {
  return toast.type === 'error' ? 'alert' : 'status'
}

function getAriaLive(toast: ToastMessage) {
  return toast.type === 'error' ? 'assertive' : 'polite'
}

async function runAction(toast: ToastMessage) {
  try {
    await toast.action?.handler()
  } catch {
    showError('操作失败，请重试。')
  } finally {
    remove(toast.id, 'action')
  }
}
</script>

<template>
  <div class="toast-container" aria-label="通知消息">
    <TransitionGroup name="toast" tag="div">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="[`toast-${toast.type}`, { 'toast-paused': toast.paused }]"
        :role="getToastRole(toast)"
        :aria-live="getAriaLive(toast)"
        aria-atomic="true"
        @mouseenter="onMouseEnter(toast)"
        @mouseleave="onMouseLeave(toast)"
        @focusin="onMouseEnter(toast)"
        @focusout="onMouseLeave(toast)"
      >
        <!-- 图标 -->
        <div class="toast-icon" :class="colorMap[toast.type]" aria-hidden="true">
          <component :is="iconMap[toast.type]" :size="20" weight="fill" class="text-white" />
        </div>

        <!-- 内容 -->
        <div class="toast-content">
          <p class="toast-message">
            <span class="sr-only">{{ typeLabelMap[toast.type] }}：</span>{{ toast.message }}
          </p>

          <!-- 操作按钮 -->
          <button
            v-if="toast.action"
            @click="runAction(toast)"
            class="toast-action"
            :aria-label="`${toast.action.label}：${toast.message}`"
          >
            {{ toast.action.label }}
          </button>
        </div>

        <!-- 关闭按钮 -->
        <button
          @click="remove(toast.id)"
          class="toast-close"
          :aria-label="`关闭提示：${toast.message}`"
        >
          <PhX :size="16" weight="bold" aria-hidden="true" />
        </button>

        <!-- 进度条（仅非持久化 Toast） -->
        <div
          v-if="toast.duration && toast.duration > 0"
          class="toast-progress"
          :class="colorMap[toast.type]"
          :style="{ animationDuration: `${toast.duration}ms` }"
          aria-hidden="true"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: none;
}

.toast-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  min-width: 320px;
  max-width: 420px;
  padding: 1rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  overflow: hidden;
  transition: all 0.2s;
}

.dark .toast-item {
  background: #2a2a2c;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.toast-item:hover {
  transform: translateX(-4px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
}

.toast-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-message {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #1f2937;
  margin: 0;
  word-wrap: break-word;
}

.dark .toast-message {
  color: #f3f4f6;
}

.toast-action {
  margin-top: 0.5rem;
  font-size: 0.813rem;
  font-weight: 600;
  color: #3b82f6;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: color 0.2s;
}

.toast-action:hover {
  color: #2563eb;
  text-decoration: underline;
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.toast-close:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1f2937;
}

.dark .toast-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f3f4f6;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  transform-origin: left;
  animation: progress linear forwards;
}

@keyframes progress {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.toast-paused .toast-progress {
  animation-play-state: paused;
}

/* Toast 类型变体 */
.toast-success {
  border-left: 4px solid #10b981;
}

.toast-error {
  border-left: 4px solid #ef4444;
}

.toast-warning {
  border-left: 4px solid #f59e0b;
}

.toast-info {
  border-left: 4px solid #3b82f6;
}

/* 过渡动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.2s ease-in;
}

@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-out {
  from {
    transform: translateX(0) scale(1);
    opacity: 1;
  }
  to {
    transform: translateX(100%) scale(0.9);
    opacity: 0;
  }
}

/* 响应式 */
@media (max-width: 640px) {
  .toast-container {
    top: 0.5rem;
    right: 0.5rem;
    left: 0.5rem;
  }

  .toast-item {
    min-width: auto;
    max-width: none;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
