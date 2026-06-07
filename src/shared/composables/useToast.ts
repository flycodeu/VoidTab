import { computed, ref } from 'vue'

/**
 * Toast 消息接口
 */
export type ToastCloseReason = 'timeout' | 'manual' | 'action' | 'clear'

export interface ToastAction {
  label: string
  handler: () => void | Promise<void>
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number  // 毫秒，0 表示持久化
  priority?: number  // 1-5，数字越大优先级越高
  action?: ToastAction
  paused: boolean
  remaining: number
  timestamp: number
}

interface ToastOptions {
  duration?: number
  priority?: number
  action?: ToastAction
  onClose?: (toast: ToastMessage, reason: ToastCloseReason) => void
}

/**
 * Toast 配置
 */
const MAX_TOASTS = 3  // 最多同时显示 3 个
const DEFAULT_DURATION = 4000  // 默认 4 秒

/**
 * Toast 状态
 */
const toasts = ref<ToastMessage[]>([])
const queue = ref<ToastMessage[]>([])
let idCounter = 0
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const startedAt = new Map<string, number>()
const closeHandlers = new Map<string, NonNullable<ToastOptions['onClose']>>()

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `toast-${Date.now()}-${idCounter++}`
}

/**
 * 添加 Toast
 */
function addToast(
  type: ToastMessage['type'],
  message: string,
  options?: ToastOptions
): string {
  const duration = options?.duration ?? DEFAULT_DURATION
  const toast: ToastMessage = {
    id: generateId(),
    type,
    message,
    duration,
    priority: options?.priority ?? 3,
    action: options?.action,
    paused: false,
    remaining: duration,
    timestamp: Date.now()
  }

  if (options?.onClose) closeHandlers.set(toast.id, options.onClose)

  // 根据优先级插入队列
  if (toasts.value.length < MAX_TOASTS) {
    // 直接显示
    showToast(toast)
  } else {
    // 加入队列
    queue.value.push(toast)
    // 按优先级排序
    queue.value.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  return toast.id
}

/**
 * 显示 Toast
 */
function showToast(toast: ToastMessage) {
  toasts.value.push(toast)

  // 自动关闭（除非 duration 为 0）
  startTimer(toast, toast.remaining || toast.duration || 0)
}

function startTimer(toast: ToastMessage, duration: number) {
  clearTimer(toast.id)
  if (!duration || duration <= 0) return

  toast.paused = false
  toast.remaining = duration
  startedAt.set(toast.id, Date.now())
  timers.set(toast.id, setTimeout(() => {
    removeToast(toast.id, 'timeout')
  }, duration))
}

function clearTimer(id: string) {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  startedAt.delete(id)
}

function finalizeToast(toast: ToastMessage, reason: ToastCloseReason) {
  clearTimer(toast.id)
  const onClose = closeHandlers.get(toast.id)
  closeHandlers.delete(toast.id)
  onClose?.(toast, reason)
}

function showNextToast() {
  if (queue.value.length > 0 && toasts.value.length < MAX_TOASTS) {
    const next = queue.value.shift()
    if (next) {
      showToast(next)
    }
  }
}

/**
 * 移除 Toast
 */
function removeToast(id: string, reason: ToastCloseReason = 'manual') {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    const [removed] = toasts.value.splice(index, 1)
    finalizeToast(removed, reason)
  } else {
    const queuedIndex = queue.value.findIndex(t => t.id === id)
    if (queuedIndex > -1) {
      const [removed] = queue.value.splice(queuedIndex, 1)
      finalizeToast(removed, reason)
    }
  }

  // 从队列中显示下一个
  showNextToast()
}

function pauseToast(id: string) {
  const toast = toasts.value.find(t => t.id === id)
  if (!toast || !toast.duration || toast.duration <= 0 || toast.paused) return

  const started = startedAt.get(id) ?? Date.now()
  const elapsed = Date.now() - started
  toast.remaining = Math.max(0, toast.remaining - elapsed)
  toast.paused = true
  clearTimer(id)
}

function resumeToast(id: string) {
  const toast = toasts.value.find(t => t.id === id)
  if (!toast || !toast.duration || toast.duration <= 0 || !toast.paused) return

  if (toast.remaining <= 0) {
    removeToast(id, 'timeout')
    return
  }

  startTimer(toast, toast.remaining)
}

/**
 * 清除所有 Toast
 */
function clearAll() {
  const allToasts = [...toasts.value, ...queue.value]
  toasts.value = []
  queue.value = []
  allToasts.forEach(toast => finalizeToast(toast, 'clear'))
}

/**
 * 快捷方法
 */
export function useToast() {
  return {
    toasts: computed(() => toasts.value),

    success(message: string, options?: ToastOptions) {
      return addToast('success', message, { ...options, priority: 3 })
    },

    error(message: string, options?: ToastOptions) {
      return addToast('error', message, { ...options, priority: 5, duration: options?.duration ?? 6000 })
    },

    warning(message: string, options?: ToastOptions) {
      return addToast('warning', message, { ...options, priority: 4 })
    },

    info(message: string, options?: ToastOptions) {
      return addToast('info', message, { ...options, priority: 2 })
    },

    /**
     * 持久化 Toast（需要手动关闭）
     */
    persistent(type: ToastMessage['type'], message: string, action?: ToastAction) {
      return addToast(type, message, { duration: 0, priority: 5, action })
    },

    /**
     * 移除指定 Toast
     */
    remove(id: string, reason: ToastCloseReason = 'manual') {
      removeToast(id, reason)
    },

    pause(id: string) {
      pauseToast(id)
    },

    resume(id: string) {
      resumeToast(id)
    },

    /**
     * 清除所有
     */
    clear() {
      clearAll()
    }
  }
}
