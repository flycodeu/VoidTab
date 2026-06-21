<script setup lang="ts">
import {ref} from 'vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useHistoryStore} from '../../../../stores/useHistoryStore';
import {
  PhClockCounterClockwise,
  PhDatabase,
  PhLock,
  PhShieldCheck,
  PhTrash,
  PhWarning
} from '@phosphor-icons/vue';
import ConfirmDialog from '../../../../shared/ui/dialogs/ConfirmDialog.vue';
import {useToast} from '../../../../shared/composables/useToast';

const store = useConfigStore();
const historyStore = useHistoryStore();
const toast = useToast();
const showClearConfirm = ref(false);
const emit = defineEmits<{ (e: 'openPrivacyVault'): void }>();

const toggleHistory = () => {
  store.config.theme.enableHistory = !store.config.theme.enableHistory;
  store.saveConfig();
};

const clearUsageRecords = async () => {
  await historyStore.clearAll();
  showClearConfirm.value = false;
  toast.success('VoidTab 使用记录已清空');
};
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <section class="space-y-1">
      <h3 class="text-xl font-bold flex items-center gap-2">
        <PhShieldCheck class="text-[var(--accent-color)]" weight="duotone"/>
        隐私设置
      </h3>
      <p class="text-sm opacity-60">管理本地记录和数据保存策略。</p>
    </section>

    <section class="privacy-card">
      <div class="flex items-center gap-4 min-w-0">
        <div class="privacy-icon text-violet-500 bg-violet-500/10">
          <PhLock size="24" weight="duotone"/>
        </div>
        <div class="min-w-0">
          <div class="font-bold text-base">隐私空间</div>
          <p class="text-xs opacity-60 mt-1 leading-relaxed">加密保存需要隐藏的网站和分组，进入后可筛选、恢复或移除内容。</p>
        </div>
      </div>

      <button type="button" class="vault-btn" @click="emit('openPrivacyVault')">
        打开
      </button>
    </section>

    <section class="privacy-card">
      <div class="flex items-center gap-4 min-w-0">
        <div class="privacy-icon text-blue-500 bg-blue-500/10">
          <PhClockCounterClockwise size="24" weight="duotone"/>
        </div>
        <div class="min-w-0">
          <div class="font-bold text-base">VoidTab 使用记录</div>
          <p class="text-xs opacity-60 mt-1 leading-relaxed">用于本地回溯和排序，不读取浏览器历史。</p>
        </div>
      </div>

      <button
          @click="toggleHistory"
          class="toggle"
          :class="store.config.theme.enableHistory ? 'toggle-on' : 'toggle-off'"
          type="button"
          :aria-pressed="store.config.theme.enableHistory"
      >
        <span :class="store.config.theme.enableHistory ? 'translate-x-5' : 'translate-x-0'"></span>
      </button>
    </section>

    <section class="privacy-card">
      <div class="flex items-center gap-4 min-w-0">
        <div class="privacy-icon text-emerald-500 bg-emerald-500/10">
          <PhDatabase size="24" weight="duotone"/>
        </div>
        <div class="min-w-0">
          <div class="font-bold text-base">本地优先</div>
          <p class="text-xs opacity-60 mt-1 leading-relaxed">配置默认保存在本机浏览器；同步时敏感字段不会明文上传。</p>
        </div>
      </div>

      <button type="button" class="clear-btn" @click="showClearConfirm = true">
        <PhTrash size="16" weight="bold"/>
        清空记录
      </button>
    </section>

    <section class="notice">
      <PhWarning class="shrink-0 mt-0.5" size="20" weight="duotone"/>
      <div>
        <p class="font-bold text-sm">权限边界</p>
        <p class="mt-1 opacity-80">VoidTab 不申请浏览器历史权限，不会自动读取剪贴板或当前网页内容。</p>
      </div>
    </section>

    <ConfirmDialog
        :show="showClearConfirm"
        title="清空 VoidTab 使用记录？"
        :message="['这只会删除 VoidTab 内部记录的搜索、跳转和 AI 使用记录。', '不会影响分组、站点、组件、主题或浏览器历史。']"
        confirmText="确认清空"
        cancelText="取消"
        :danger="true"
        @cancel="showClearConfirm = false"
        @confirm="clearUsageRecords"
    >
      <template #icon>
        <PhTrash :size="32" weight="duotone"/>
      </template>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.privacy-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  background: var(--modal-input-bg);
}

.privacy-icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toggle {
  position: relative;
  width: 48px;
  height: 28px;
  border-radius: 999px;
  flex-shrink: 0;
  transition: background 0.18s ease;
}

.toggle span {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: white;
  box-shadow: 0 3px 8px rgba(15, 23, 42, 0.18);
  transition: transform 0.18s ease;
}

.toggle-on {
  background: var(--accent-color);
}

.toggle-off {
  background: rgba(100, 116, 139, 0.72);
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(239, 68, 68, 0.26);
  color: rgb(239, 68, 68);
  font-size: 12px;
  font-weight: 900;
  flex-shrink: 0;
  transition: background 0.16s ease, transform 0.16s ease;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.10);
}

.clear-btn:active {
  transform: scale(0.98);
}

.vault-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  min-width: 72px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--accent-color);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  flex-shrink: 0;
  box-shadow: 0 8px 20px rgba(var(--accent-color-rgb), 0.18);
  transition: transform 0.16s ease, opacity 0.16s ease;
}

.vault-btn:hover {
  opacity: 0.92;
}

.vault-btn:active {
  transform: scale(0.98);
}

.notice {
  display: flex;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  background: rgba(37, 99, 235, 0.06);
  color: rgb(37, 99, 235);
  font-size: 12px;
  line-height: 1.6;
}

.animate-fade-in {
  animation: fadeIn 0.22s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 760px) {
  .privacy-card {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
