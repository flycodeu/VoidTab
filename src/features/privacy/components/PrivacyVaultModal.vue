<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {
  PhArrowCounterClockwise,
  PhArrowSquareOut,
  PhFolder,
  PhGear,
  PhKey,
  PhLock,
  PhMagnifyingGlass,
  PhPlus,
  PhShieldCheck,
  PhTrash,
  PhX
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../stores/useConfigStore';
import {useToast} from '../../../shared/composables/useToast';
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useConfigStore();
const toast = useToast();

const unlockPassword = ref('');
const createPassword = ref('');
const createConfirm = ref('');
const oldPassword = ref('');
const newPassword = ref('');
const newConfirm = ref('');
const removePassword = ref('');
const entryPhrase = ref('');
const errorText = ref('');
const changeError = ref('');
const entryError = ref('');
const removeError = ref('');
const showForgetConfirm = ref(false);
const activeView = ref<'sites' | 'groups' | 'add' | 'settings'>('sites');
const addMode = ref<'site' | 'group'>('site');
const addQuery = ref('');
const actionBusyId = ref('');
const pendingDelete = ref<{ type: 'site' | 'group'; id: string; title: string } | null>(null);

const payload = computed(() => store.privacyPayload || {version: 1, groups: [], sites: []});
const hiddenSiteEntries = computed(() => payload.value.sites || []);
const hiddenGroupEntries = computed(() => payload.value.groups || []);
const hasVault = computed(() => store.hasPrivacyVault);
const isUnlocked = computed(() => store.privacyUnlocked);
const createDisabled = computed(() => createPassword.value.length < 6 || createPassword.value !== createConfirm.value || store.privacyBusy);
const unlockDisabled = computed(() => !unlockPassword.value || store.privacyBusy);
const changeDisabled = computed(() => !oldPassword.value || newPassword.value.length < 6 || newPassword.value !== newConfirm.value || store.privacyBusy);
const removeDisabled = computed(() => !removePassword.value && !isUnlocked.value);
const entryDisabled = computed(() => {
  const next = entryPhrase.value.trim();
  return !next || next === store.config.privacy.entry.phrase || store.privacyBusy;
});
const normalGroups = computed(() => store.config.layout || []);

const candidateGroups = computed(() => {
  const query = addQuery.value.trim().toLowerCase();
  return normalGroups.value.filter((group: any) => !query || String(group.title || '').toLowerCase().includes(query));
});

const candidateSites = computed(() => {
  const query = addQuery.value.trim().toLowerCase();
  const list: Array<{ groupId: string; groupTitle: string; site: any }> = [];
  normalGroups.value.forEach((group: any) => {
    (group.items || []).forEach((site: any) => {
      if (site.kind === 'widget') return;
      const haystack = `${site.title || ''} ${site.url || ''} ${group.title || ''}`.toLowerCase();
      if (!query || haystack.includes(query)) list.push({groupId: group.id, groupTitle: group.title, site});
    });
  });
  return list;
});

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    errorText.value = '';
    changeError.value = '';
    entryError.value = '';
    removeError.value = '';
    unlockPassword.value = '';
    createPassword.value = '';
    createConfirm.value = '';
    oldPassword.value = '';
    newPassword.value = '';
    newConfirm.value = '';
    removePassword.value = '';
    entryPhrase.value = store.config.privacy?.entry?.phrase || ':void';
    addMode.value = 'site';
    addQuery.value = '';
    activeView.value = hiddenSiteEntries.value.length === 0 && hiddenGroupEntries.value.length > 0 ? 'groups' : 'sites';
  }
);

const normalizeUrl = (url?: string) => {
  const value = (url || '').trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const siteInitial = (title?: string) => (title || 'V').trim().slice(0, 2).toUpperCase();

const createVault = async () => {
  if (createDisabled.value) return;
  errorText.value = '';
  try {
    const result = await store.createPrivacyVault(createPassword.value);
    if (!result.success) {
      errorText.value = result.message;
      return;
    }
    toast.success(result.message);
    createPassword.value = '';
    createConfirm.value = '';
    entryPhrase.value = store.config.privacy.entry.phrase;
    activeView.value = 'add';
  } catch (error: any) {
    errorText.value = error?.message || '创建失败。';
  }
};

const unlockVault = async () => {
  if (unlockDisabled.value) return;
  errorText.value = '';
  try {
    await store.unlockPrivacyVault(unlockPassword.value);
    unlockPassword.value = '';
    toast.success('已解锁。');
    entryPhrase.value = store.config.privacy.entry.phrase;
    activeView.value = hiddenSiteEntries.value.length || hiddenGroupEntries.value.length ? 'sites' : 'add';
  } catch (error: any) {
    errorText.value = error?.message || '解锁失败。';
  }
};

const openSite = (url?: string) => {
  const target = normalizeUrl(url);
  if (!target) return;
  store.touchPrivacySession();
  window.open(target, '_blank', 'noopener,noreferrer');
};

const restoreSite = async (id: string) => {
  const result = await store.restorePrivacySite(id);
  result.success ? toast.success(result.message) : toast.warning(result.message);
};

const restoreGroup = async (id: string) => {
  const result = await store.restorePrivacyGroup(id);
  result.success ? toast.success(result.message) : toast.warning(result.message);
};

const hideSite = async (groupId: string, siteId: string) => {
  actionBusyId.value = `site:${siteId}`;
  try {
    const result = await store.moveSiteToPrivacy(groupId, siteId);
    if (result.success) {
      toast.success(result.message);
      activeView.value = 'sites';
      addQuery.value = '';
      return;
    }
    toast.warning(result.message);
  } catch (error: any) {
    toast.error(error?.message || '添加失败。');
  } finally {
    actionBusyId.value = '';
  }
};

const hideGroup = async (groupId: string) => {
  actionBusyId.value = `group:${groupId}`;
  try {
    const result = await store.moveGroupToPrivacy(groupId);
    if (result.success) {
      toast.success(result.message);
      activeView.value = 'groups';
      addQuery.value = '';
      return;
    }
    toast.warning(result.message);
  } catch (error: any) {
    toast.error(error?.message || '添加失败。');
  } finally {
    actionBusyId.value = '';
  }
};

const changePassword = async () => {
  changeError.value = '';
  if (changeDisabled.value) return;
  try {
    const result = await store.changePrivacyPassword(oldPassword.value, newPassword.value);
    if (!result.success) {
      changeError.value = result.message;
      return;
    }
    oldPassword.value = '';
    newPassword.value = '';
    newConfirm.value = '';
    toast.success(result.message);
  } catch (error: any) {
    changeError.value = error?.message || '密码更新失败。';
  }
};

const removeVault = async (restore: boolean) => {
  removeError.value = '';
  if (removeDisabled.value) return;
  try {
    const result = await store.removePrivacyVault({restore, password: removePassword.value || undefined});
    if (!result.success) {
      removeError.value = result.message;
      return;
    }
    removePassword.value = '';
    toast.success(result.message);
    if (!restore) emit('close');
  } catch (error: any) {
    removeError.value = error?.message || '移除失败。';
  }
};

const discardWithoutPassword = async () => {
  const result = await store.discardPrivacyVaultWithoutPassword();
  showForgetConfirm.value = false;
  toast.warning(result.message);
  emit('close');
};

const updateEntryPhrase = async () => {
  entryError.value = '';
  if (entryDisabled.value) return;
  try {
    const result = await store.setPrivacyEntryPhrase(entryPhrase.value);
    if (!result.success) {
      entryError.value = result.message;
      return;
    }
    entryPhrase.value = store.config.privacy.entry.phrase;
    toast.success(result.message);
  } catch (error: any) {
    entryError.value = error?.message || '入口更新失败。';
  }
};

const onAutoLockInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  store.setPrivacyAutoLockMinutes(Number(input.value));
};

const confirmDelete = (type: 'site' | 'group', id: string, title: string) => {
  pendingDelete.value = {type, id, title};
};

const runDelete = async () => {
  const target = pendingDelete.value;
  if (!target) return;
  const result = target.type === 'site'
      ? await store.deletePrivacySite(target.id)
      : await store.deletePrivacyGroup(target.id);
  pendingDelete.value = null;
  result.success ? toast.success(result.message) : toast.warning(result.message);
};

const lockVault = () => {
  store.lockPrivacyVault();
  toast.info('已锁定。');
};
</script>

<template>
  <Teleport to="body">
    <Transition name="privacy-modal">
      <div v-if="show" class="privacy-shell fixed inset-0 z-[99998] flex items-center justify-center p-4" data-modal="1">
        <div class="absolute inset-0 bg-black/62 backdrop-blur-md" @click="emit('close')" aria-hidden="true"></div>

        <section class="privacy-dialog relative w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-[24px] border shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="privacy-vault-title">
          <header class="privacy-head">
            <div class="flex items-center gap-3 min-w-0">
              <div class="privacy-mark"><PhShieldCheck size="22" weight="fill"/></div>
              <div class="min-w-0">
                <h2 id="privacy-vault-title" class="text-lg font-black leading-tight">隐私空间</h2>
                <p class="text-xs opacity-60 mt-0.5">{{ hasVault ? (isUnlocked ? '已解锁' : '已锁定') : '未创建' }}</p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button v-if="isUnlocked" class="icon-btn" type="button" title="锁定" aria-label="锁定隐私空间" @click="lockVault"><PhLock size="18" weight="bold"/></button>
              <button class="icon-btn" type="button" title="关闭" aria-label="关闭隐私空间" @click="emit('close')"><PhX size="18" weight="bold"/></button>
            </div>
          </header>

          <main class="privacy-body">
            <form v-if="!hasVault" class="auth-panel" @submit.prevent="createVault">
              <div class="auth-icon"><PhKey size="28" weight="duotone"/></div>
              <h3 class="text-xl font-black">设置密码</h3>
              <div class="auth-fields">
                <input v-model="createPassword" type="password" autocomplete="new-password" placeholder="至少 6 位"/>
                <input v-model="createConfirm" type="password" autocomplete="new-password" placeholder="再次输入"/>
              </div>
              <p v-if="errorText" class="error-text">{{ errorText }}</p>
              <button class="primary-btn" type="submit" :disabled="createDisabled">创建</button>
            </form>

            <form v-else-if="!isUnlocked" class="auth-panel" @submit.prevent="unlockVault">
              <div class="auth-icon"><PhLock size="28" weight="duotone"/></div>
              <h3 class="text-xl font-black">输入密码</h3>
              <div class="auth-fields">
                <input v-model="unlockPassword" type="password" autocomplete="current-password" placeholder="密码" autofocus/>
              </div>
              <p v-if="errorText" class="error-text">{{ errorText }}</p>
              <button class="primary-btn" type="submit" :disabled="unlockDisabled">进入</button>
            </form>

            <template v-else>
              <div class="vault-tabs" role="tablist" aria-label="隐私空间内容">
                <button type="button" :class="{ active: activeView === 'sites' }" @click="activeView = 'sites'">网站 <span>{{ hiddenSiteEntries.length }}</span></button>
                <button type="button" :class="{ active: activeView === 'groups' }" @click="activeView = 'groups'">分组 <span>{{ hiddenGroupEntries.length }}</span></button>
                <button type="button" :class="{ active: activeView === 'add' }" @click="activeView = 'add'">添加</button>
                <button type="button" :class="{ active: activeView === 'settings' }" @click="activeView = 'settings'"><PhGear size="14" weight="bold"/></button>
              </div>

              <div v-if="activeView === 'sites'" class="vault-list">
                <div v-if="hiddenSiteEntries.length === 0" class="empty-row">没有内容</div>
                <article v-for="entry in hiddenSiteEntries" :key="entry.site.id" class="vault-row">
                  <div class="site-badge">{{ siteInitial(entry.site.title) }}</div>
                  <div class="min-w-0 flex-1">
                    <h4 class="row-title">{{ entry.site.title || '未命名' }}</h4>
                    <p class="row-subtitle">{{ entry.site.url || '无链接' }}</p>
                  </div>
                  <div class="row-actions">
                    <button type="button" title="打开" aria-label="打开网站" @click="openSite(entry.site.url)"><PhArrowSquareOut size="17" weight="bold"/></button>
                    <button type="button" title="恢复" aria-label="恢复" @click="restoreSite(entry.site.id)"><PhArrowCounterClockwise size="17" weight="bold"/></button>
                    <button type="button" title="删除" aria-label="永久删除" class="danger" @click="confirmDelete('site', entry.site.id, entry.site.title || '未命名')"><PhTrash size="17" weight="bold"/></button>
                  </div>
                </article>
              </div>

              <div v-else-if="activeView === 'groups'" class="vault-list">
                <div v-if="hiddenGroupEntries.length === 0" class="empty-row">没有内容</div>
                <article v-for="entry in hiddenGroupEntries" :key="entry.group.id" class="vault-row">
                  <div class="folder-badge"><PhFolder size="20" weight="fill"/></div>
                  <div class="min-w-0 flex-1">
                    <h4 class="row-title">{{ entry.group.title || '未命名分组' }}</h4>
                    <p class="row-subtitle">{{ entry.group.items.length }} 个项目</p>
                  </div>
                  <div class="row-actions">
                    <button type="button" title="恢复" aria-label="恢复" @click="restoreGroup(entry.group.id)"><PhArrowCounterClockwise size="17" weight="bold"/></button>
                    <button type="button" title="删除" aria-label="永久删除" class="danger" @click="confirmDelete('group', entry.group.id, entry.group.title || '未命名分组')"><PhTrash size="17" weight="bold"/></button>
                  </div>
                </article>
              </div>

              <div v-else-if="activeView === 'add'" class="add-panel">
                <div class="add-toolbar">
                  <div class="add-mode">
                    <button type="button" :class="{ active: addMode === 'site' }" @click="addMode = 'site'">网站</button>
                    <button type="button" :class="{ active: addMode === 'group' }" @click="addMode = 'group'">分组</button>
                  </div>
                  <label class="add-search">
                    <PhMagnifyingGlass size="16" weight="bold"/>
                    <input v-model="addQuery" type="text" placeholder="筛选当前桌面内容"/>
                  </label>
                </div>

                <div v-if="addMode === 'site'" class="vault-list">
                  <div v-if="candidateSites.length === 0" class="empty-row">没有可添加的网站</div>
                  <article v-for="entry in candidateSites" :key="entry.site.id" class="vault-row">
                    <div class="site-badge">{{ siteInitial(entry.site.title) }}</div>
                    <div class="min-w-0 flex-1">
                      <h4 class="row-title">{{ entry.site.title || '未命名' }}</h4>
                      <p class="row-subtitle">{{ entry.groupTitle }} · {{ entry.site.url || '无链接' }}</p>
                    </div>
                    <div class="row-actions">
                      <button type="button" title="添加" aria-label="添加" :disabled="actionBusyId === `site:${entry.site.id}`" @click="hideSite(entry.groupId, entry.site.id)"><PhPlus size="17" weight="bold"/></button>
                    </div>
                  </article>
                </div>

                <div v-else class="vault-list">
                  <div v-if="candidateGroups.length === 0" class="empty-row">没有可添加的分组</div>
                  <article v-for="group in candidateGroups" :key="group.id" class="vault-row">
                    <div class="folder-badge"><PhFolder size="20" weight="fill"/></div>
                    <div class="min-w-0 flex-1">
                      <h4 class="row-title">{{ group.title || '未命名分组' }}</h4>
                      <p class="row-subtitle">{{ group.items.length }} 个项目</p>
                    </div>
                    <div class="row-actions">
                      <button type="button" title="添加" aria-label="添加" :disabled="actionBusyId === `group:${group.id}`" @click="hideGroup(group.id)"><PhPlus size="17" weight="bold"/></button>
                    </div>
                  </article>
                </div>
              </div>

              <div v-else class="settings-panel">
                <form class="settings-form" @submit.prevent="updateEntryPhrase">
                  <input v-model="entryPhrase" type="text" autocomplete="off" spellcheck="false" placeholder="入口暗号"/>
                  <p v-if="entryError" class="error-text">{{ entryError }}</p>
                  <button class="secondary-btn" type="submit" :disabled="entryDisabled">更新入口</button>
                </form>

                <label class="setting-row">
                  <span>自动锁定</span>
                  <input :value="store.config.privacy.entry.autoLockMinutes" type="number" min="1" max="240" @change="onAutoLockInput"/>
                  <span>分钟</span>
                </label>

                <form class="settings-form" @submit.prevent="changePassword">
                  <input v-model="oldPassword" type="password" autocomplete="current-password" placeholder="当前密码"/>
                  <input v-model="newPassword" type="password" autocomplete="new-password" placeholder="新密码"/>
                  <input v-model="newConfirm" type="password" autocomplete="new-password" placeholder="再次输入"/>
                  <p v-if="changeError" class="error-text">{{ changeError }}</p>
                  <button class="secondary-btn" type="submit" :disabled="changeDisabled">更新密码</button>
                </form>

                <form class="settings-form" @submit.prevent>
                  <input v-model="removePassword" type="password" autocomplete="current-password" placeholder="密码（已解锁时可留空）"/>
                  <p v-if="removeError" class="error-text">{{ removeError }}</p>
                  <div class="danger-actions">
                    <button class="secondary-btn" type="button" :disabled="removeDisabled" @click="removeVault(true)">恢复并关闭</button>
                    <button class="danger-btn" type="button" :disabled="removeDisabled" @click="removeVault(false)">永久删除</button>
                    <button class="plain-danger" type="button" @click="showForgetConfirm = true">仅删除密文</button>
                  </div>
                </form>
              </div>
            </template>
          </main>
        </section>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog :show="!!pendingDelete" title="永久删除？" :message="pendingDelete ? [`「${pendingDelete.title}」将被删除，无法撤销。`] : ['确认删除？']" confirmText="永久删除" cancelText="取消" :danger="true" @cancel="pendingDelete = null" @confirm="runDelete">
    <template #icon><PhTrash :size="32" weight="duotone"/></template>
  </ConfirmDialog>

  <ConfirmDialog :show="showForgetConfirm" title="删除密文？" :message="['这不会恢复内容。', '密码遗失时，内容无法找回。']" confirmText="删除密文" cancelText="取消" :danger="true" @cancel="showForgetConfirm = false" @confirm="discardWithoutPassword">
    <template #icon><PhTrash :size="32" weight="duotone"/></template>
  </ConfirmDialog>
</template>

<style scoped>
.privacy-dialog {
  background: var(--settings-surface);
  border-color: var(--settings-border);
  color: var(--settings-text);
}

.privacy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--settings-border);
  background: rgba(var(--overlay-rgb), 0.06);
}

.privacy-mark,
.auth-icon {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
  flex-shrink: 0;
}

.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-text);
  background: rgba(var(--overlay-rgb), 0.08);
  border: 1px solid rgba(var(--overlay-rgb), 0.10);
  transition: transform 0.16s ease, background 0.16s ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
  background: rgba(var(--overlay-rgb), 0.14);
}

.privacy-body {
  padding: 20px;
  overflow-y: auto;
  max-height: calc(86vh - 82px);
}

.auth-panel,
.settings-panel,
.add-panel,
.vault-list {
  display: grid;
  gap: 12px;
}

.auth-panel {
  max-width: 390px;
  margin: 34px auto 42px;
  justify-items: center;
  text-align: center;
}

.auth-fields,
.settings-form {
  width: 100%;
  display: grid;
  gap: 10px;
}

.auth-fields input,
.settings-form input,
.setting-row input,
.add-search input {
  min-width: 0;
  background: transparent;
  color: var(--settings-text);
  outline: none;
}

.auth-fields input,
.settings-form input,
.setting-row input {
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: var(--modal-input-bg);
  padding: 0 13px;
}

.auth-fields input:focus,
.settings-form input:focus,
.setting-row input:focus,
.add-search:focus-within {
  border-color: rgba(var(--accent-color-rgb), 0.62);
  box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.14);
}

.primary-btn,
.secondary-btn,
.danger-btn,
.plain-danger {
  height: 42px;
  border-radius: 14px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  transition: transform 0.16s ease, opacity 0.16s ease, background 0.16s ease;
}

.primary-btn {
  min-width: 120px;
  background: var(--accent-color);
  color: #fff;
}

.secondary-btn {
  background: rgba(var(--overlay-rgb), 0.08);
  border: 1px solid rgba(var(--overlay-rgb), 0.12);
}

.danger-btn {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.26);
}

.plain-danger {
  color: rgb(239, 68, 68);
  background: transparent;
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.error-text {
  color: rgb(239, 68, 68);
  font-size: 12px;
}

.vault-tabs,
.add-mode {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border-radius: 16px;
  background: rgba(var(--overlay-rgb), 0.08);
  border: 1px solid rgba(var(--overlay-rgb), 0.10);
}

.vault-tabs {
  margin-bottom: 16px;
}

.vault-tabs button,
.add-mode button {
  height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 900;
  opacity: 0.72;
}

.vault-tabs button.active,
.add-mode button.active {
  opacity: 1;
  color: #fff;
  background: var(--accent-color);
}

.vault-tabs span {
  margin-left: 5px;
  opacity: 0.78;
}

.add-toolbar,
.setting-row,
.danger-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.add-search {
  flex: 1;
  min-width: 0;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(var(--overlay-rgb), 0.055);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}

.add-search input {
  flex: 1;
  font-size: 13px;
}

.setting-row {
  font-size: 13px;
  font-weight: 800;
}

.setting-row input {
  width: 76px;
}

.vault-row,
.empty-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(var(--overlay-rgb), 0.10);
  background: rgba(var(--overlay-rgb), 0.055);
}

.empty-row {
  justify-content: center;
  opacity: 0.55;
  font-size: 13px;
}

.site-badge,
.folder-badge {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  background: linear-gradient(135deg, #0f766e, #2563eb);
  font-size: 13px;
  font-weight: 1000;
}

.folder-badge {
  background: linear-gradient(135deg, #334155, #0f766e);
}

.row-title {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-subtitle {
  margin-top: 3px;
  font-size: 11px;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.row-actions button {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--settings-text);
  background: rgba(var(--overlay-rgb), 0.08);
  transition: transform 0.16s ease, background 0.16s ease;
}

.row-actions button:hover {
  transform: translateY(-1px);
  background: rgba(var(--overlay-rgb), 0.14);
}

.row-actions button:disabled {
  opacity: 0.45;
  cursor: wait;
  transform: none;
}

.row-actions button.danger {
  color: rgb(239, 68, 68);
}

.privacy-modal-enter-active,
.privacy-modal-leave-active {
  transition: opacity 0.22s ease;
}

.privacy-modal-enter-from,
.privacy-modal-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .privacy-body {
    padding: 14px;
  }

  .vault-row {
    align-items: flex-start;
  }

  .row-actions {
    display: grid;
    grid-template-columns: repeat(3, 34px);
  }

  .add-toolbar,
  .setting-row,
  .danger-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
