<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { PhWarning, PhArrowClockwise, PhBug, PhClipboardText } from '@phosphor-icons/vue'
import { useToast } from '../composables/useToast'

withDefaults(defineProps<{
  fallback?: boolean
}>(), {
  fallback: true
})

const error = ref<Error | null>(null)
const errorInfo = ref<string>('')
const errorStack = ref<string>('')
const toast = useToast()

onErrorCaptured((err, instance, info) => {
  const shouldNotify = !error.value
  error.value = err
  errorInfo.value = info
  errorStack.value = err.stack || ''

  if (import.meta.env.DEV) {
    console.warn('[ErrorBoundary] Caught error:', {
      error: err,
      info,
      component: instance?.$options.name || 'Unknown'
    })
  }

  if (shouldNotify) {
    toast.error('页面渲染失败，请尝试重新加载。')
  }

  // 阻止错误继续向上传播
  return false
})

const retry = () => {
  error.value = null
  errorInfo.value = ''
  errorStack.value = ''

  // 刷新页面以恢复应用状态
  window.location.reload()
}

const reportIssue = () => {
  const issueBody = `
**错误描述**
${error.value?.message || '未知错误'}

**错误信息**
${errorInfo.value}

**错误堆栈**
\`\`\`
${errorStack.value}
\`\`\`

**环境信息**
- 浏览器: ${navigator.userAgent}
- 时间: ${new Date().toISOString()}
  `.trim()

  const issueUrl = `https://github.com/flycodeu/VoidTab/issues/new?title=${encodeURIComponent('Bug: ' + error.value?.message)}&body=${encodeURIComponent(issueBody)}`
  window.open(issueUrl, '_blank')
}

const copyError = () => {
  const errorText = `${error.value?.message}\n${errorStack.value}`
  navigator.clipboard.writeText(errorText).then(() => {
    toast.success('错误信息已复制到剪贴板。')
  }).catch(() => {
    toast.error('复制失败，请手动展开详情复制。')
  })
}
</script>

<template>
  <div v-if="error && fallback" class="error-boundary">
    <div class="error-container">
      <div class="error-icon">
        <PhWarning :size="64" weight="fill" />
      </div>

      <h2 class="error-title">页面遇到异常</h2>

      <p class="error-message">当前视图已停止渲染。可以重新加载，或复制详情后报告问题。</p>

      <div class="error-actions">
        <button @click="retry" class="btn btn-primary">
          <PhArrowClockwise :size="20" weight="bold" />
          <span>重新加载</span>
        </button>

        <button @click="reportIssue" class="btn btn-secondary">
          <PhBug :size="20" />
          <span>报告问题</span>
        </button>

        <button @click="copyError" class="btn btn-secondary">
          <PhClipboardText :size="20" />
          <span>复制错误信息</span>
        </button>
      </div>

      <details class="error-details">
        <summary>查看详细错误信息</summary>
        <div class="error-stack">
          <p><strong>错误类型:</strong> {{ errorInfo }}</p>
          <pre>{{ errorStack }}</pre>
        </div>
      </details>
    </div>
  </div>

  <slot v-else />
</template>

<style scoped>
.error-boundary {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, rgba(255, 0, 0, 0.05), rgba(255, 100, 100, 0.05));
}

.error-container {
  max-width: 600px;
  width: 100%;
  padding: 3rem;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.dark .error-container {
  background: rgba(30, 30, 30, 0.95);
}

.error-icon {
  margin-bottom: 1.5rem;
  color: #ef4444;
}

.error-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1f2937;
}

.dark .error-title {
  color: #f3f4f6;
}

.error-message {
  font-size: 1rem;
  color: #6b7280;
  margin-bottom: 2rem;
  line-height: 1.6;
}

.dark .error-message {
  color: #9ca3af;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 2rem;
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
  background: #ef4444;
  color: white;
}

.btn-primary:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.btn-secondary {
  background: #f3f4f6;
  color: #1f2937;
}

.dark .btn-secondary {
  background: #374151;
  color: #f3f4f6;
}

.btn-secondary:hover {
  background: #e5e7eb;
  transform: translateY(-1px);
}

.dark .btn-secondary:hover {
  background: #4b5563;
}

.error-details {
  text-align: left;
  margin-top: 2rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
}

.dark .error-details {
  background: rgba(255, 255, 255, 0.05);
}

.error-details summary {
  cursor: pointer;
  font-weight: 500;
  color: #6b7280;
  user-select: none;
}

.error-details summary:hover {
  color: #374151;
}

.dark .error-details summary:hover {
  color: #e5e7eb;
}

.error-stack {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: #6b7280;
}

.error-stack pre {
  margin-top: 0.5rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.dark .error-stack pre {
  background: rgba(255, 255, 255, 0.05);
}
</style>
