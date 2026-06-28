<script setup lang="ts">
import {computed, type Component} from 'vue';
import {
  PhBookOpenText,
  PhBriefcase,
  PhChatCircleDots,
  PhCheckCircle,
  PhCode,
  PhFileText,
  PhFolder,
  PhGithubLogo,
  PhGlobeSimple,
  PhHouseLine,
  PhMagicWand,
  PhPlayCircle,
} from '@phosphor-icons/vue';
import {useConfigStore} from '../../../../stores/useConfigStore';
import {useToast} from '../../../../shared/composables/useToast';
import {
  applyTemplatePreset,
  isTemplatePresetActive,
  templatePresets,
  type TemplatePreset,
  type TemplatePresetId,
} from '../../../../core/templates/presets';

const store = useConfigStore();
const toast = useToast();

const previewItems: Array<{ id: string; icon: Component; rgb: string }> = [
  {id: 'web', icon: PhGlobeSimple, rgb: '37, 99, 235'},
  {id: 'chat', icon: PhChatCircleDots, rgb: '14, 165, 233'},
  {id: 'code', icon: PhGithubLogo, rgb: '17, 24, 39'},
  {id: 'docs', icon: PhBookOpenText, rgb: '124, 58, 237'},
  {id: 'file', icon: PhFileText, rgb: '15, 118, 110'},
  {id: 'media', icon: PhPlayCircle, rgb: '220, 38, 38'},
];

const previewNavItems: Array<{ id: string; icon: Component }> = [
  {id: 'home', icon: PhHouseLine},
  {id: 'work', icon: PhBriefcase},
  {id: 'code', icon: PhCode},
  {id: 'more', icon: PhFolder},
];

const previewSidebar = (preset: TemplatePreset) => preset.layout.showSidebar ? preset.layout.sidebarPos : 'hidden';

const hasLeadingSidebar = (preset: TemplatePreset) => (
  preset.layout.showSidebar && (preset.layout.sidebarPos === 'left' || preset.layout.sidebarPos === 'top')
);

const hasTrailingSidebar = (preset: TemplatePreset) => (
  preset.layout.showSidebar && (preset.layout.sidebarPos === 'right' || preset.layout.sidebarPos === 'bottom')
);

const previewStyle = (preset: TemplatePreset) => ({
  '--template-accent': preset.accent,
  '--preview-accent': 'var(--accent-color)',
  '--preview-accent-rgb': 'var(--accent-color-rgb)',
  '--preview-icon-size': `${Math.max(22, Math.round(preset.layout.iconSize * 0.46))}px`,
  '--preview-cell-size': `${Math.max(38, Math.round(preset.layout.iconSize * 0.64))}px`,
  '--preview-radius': `${Math.max(7, Math.round(preset.layout.radius * 0.48))}px`,
  '--preview-gap': `${Math.max(5, Math.round(preset.layout.gap * 0.28))}px`,
});

const previewItemStyle = (item: typeof previewItems[number]) => ({
  '--preview-item-rgb': item.rgb,
});

const isActiveTemplate = (preset: TemplatePreset) => isTemplatePresetActive(store.config, preset.id);

const activePresetName = computed(() => {
  return templatePresets.find((preset) => isActiveTemplate(preset))?.name || '自定义';
});

const applyPreset = async (preset: TemplatePreset) => {
  applyTemplatePreset(store.config, preset.id as TemplatePresetId);
  await store.saveConfig();
  toast.success(`已应用「${preset.name}」`);
};
</script>

<template>
  <div class="template-tab animate-fade-in">
    <header class="template-heading">
      <div class="heading-title">
        <PhMagicWand size="18" weight="duotone" aria-hidden="true"/>
        <span>视图模板</span>
      </div>
      <div class="heading-status">
        当前：{{ activePresetName }}
      </div>
    </header>

    <div class="template-grid">
      <article
          v-for="preset in templatePresets"
          :key="preset.id"
          class="template-option"
          :class="{ 'template-option-active': isActiveTemplate(preset) }"
          :style="previewStyle(preset)"
      >
        <div
            class="template-preview"
            :data-mode="preset.layout.siteLayoutMode"
            :data-sidebar="previewSidebar(preset)"
            :data-density="preset.layout.density"
            aria-hidden="true"
          >
            <div
                v-if="hasLeadingSidebar(preset)"
                class="preview-nav"
            >
            <span v-for="item in previewNavItems" :key="item.id">
              <component :is="item.icon" size="12" weight="bold"/>
            </span>
          </div>

          <div class="preview-stage">
            <div class="preview-toolbar">
              <span v-if="preset.layout.showTime" class="preview-clock"></span>
              <span class="preview-search">
                <PhGlobeSimple size="11" weight="bold"/>
              </span>
            </div>
            <div class="preview-grid" :data-card="`${preset.layout.siteCard.w}x${preset.layout.siteCard.h}`">
              <span
                  v-for="item in previewItems"
                  :key="item.id"
                  class="preview-site"
                  :style="previewItemStyle(item)"
              >
                <span class="preview-site-icon">
                  <component :is="item.icon" size="15" weight="fill"/>
                </span>
                <span class="preview-site-copy">
                  <i></i>
                  <b></b>
                </span>
              </span>
            </div>
          </div>

            <div
                v-if="hasTrailingSidebar(preset)"
                class="preview-nav"
            >
            <span v-for="item in previewNavItems" :key="item.id">
              <component :is="item.icon" size="12" weight="bold"/>
            </span>
          </div>
        </div>

        <div class="template-body">
          <div class="template-title-row">
            <div class="template-title-copy">
              <span class="template-audience">{{ preset.audience }}</span>
              <h3>{{ preset.name }}</h3>
            </div>
            <span v-if="isActiveTemplate(preset)" class="active-label">
              <PhCheckCircle size="14" weight="fill" aria-hidden="true"/>
              当前
            </span>
          </div>

          <div class="template-subline">
            <span v-for="item in preset.highlights" :key="item">{{ item }}</span>
          </div>

          <div class="template-footer">
            <button
                type="button"
                class="apply-action"
                :class="{ 'apply-action-active': isActiveTemplate(preset) }"
                @click="applyPreset(preset)"
            >
              <PhCheckCircle size="15" weight="bold" aria-hidden="true"/>
              应用
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.template-tab {
  display: grid;
  gap: 18px;
}

.template-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.heading-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 15px;
  font-weight: 900;
  color: var(--text-primary);
}

.heading-status {
  max-width: 50%;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  background: rgba(var(--overlay-rgb), 0.12);
  border: 1px solid rgba(var(--overlay-rgb), 0.10);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.template-option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-height: 286px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--overlay-rgb), 0.30);
  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.18), rgba(var(--overlay-rgb), 0.09)),
      rgba(var(--overlay-rgb), 0.08);
  box-shadow:
      0 12px 28px rgba(15, 23, 42, 0.055),
      0 1px 0 rgba(255, 255, 255, 0.14) inset;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.template-option::before {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  top: -1px;
  height: 3px;
  border-radius: 999px;
  background: var(--template-accent);
  opacity: 0.42;
  transition: opacity 0.16s ease;
}

.template-option:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--accent-color-rgb), 0.38);
  background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.21), rgba(var(--overlay-rgb), 0.11)),
      rgba(var(--overlay-rgb), 0.10);
}

.template-option-active {
  border-color: rgba(var(--accent-color-rgb), 0.46);
  box-shadow:
      0 0 0 1px rgba(var(--accent-color-rgb), 0.14) inset,
      0 10px 26px rgba(var(--accent-color-rgb), 0.10);
}

.template-option-active::before {
  opacity: 1;
}

.template-preview {
  position: relative;
  display: grid;
  gap: 10px;
  min-height: 138px;
  aspect-ratio: 16 / 8.2;
  border-radius: 10px;
  padding: 11px;
  overflow: hidden;
  border: 1px solid rgba(var(--overlay-rgb), 0.22);
  background:
      radial-gradient(circle at 12% 12%, rgba(var(--preview-accent-rgb), 0.16), transparent 31%),
      radial-gradient(circle at 92% 18%, rgba(255, 255, 255, 0.18), transparent 26%),
      linear-gradient(145deg, rgba(var(--overlay-rgb), 0.18), rgba(var(--overlay-rgb), 0.07)),
      rgba(var(--overlay-rgb), 0.11);
}

.template-preview[data-sidebar="hidden"] {
  grid-template-columns: minmax(0, 1fr);
}

.template-preview[data-sidebar="left"],
.template-preview[data-sidebar="right"] {
  grid-template-columns: 32px minmax(0, 1fr);
}

.template-preview[data-sidebar="right"] {
  grid-template-columns: minmax(0, 1fr) 32px;
}

.template-preview[data-sidebar="top"],
.template-preview[data-sidebar="bottom"] {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 24px minmax(0, 1fr);
}

.template-preview[data-sidebar="bottom"] {
  grid-template-rows: minmax(0, 1fr) 24px;
}

.preview-nav {
  display: flex;
  gap: 6px;
  padding: 5px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(var(--overlay-rgb), 0.12);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.18) inset;
}

.template-preview[data-sidebar="left"] .preview-nav,
.template-preview[data-sidebar="right"] .preview-nav {
  flex-direction: column;
}

.preview-nav span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  min-height: 10px;
  border-radius: 7px;
  color: rgba(var(--preview-accent-rgb), 0.72);
  background: rgba(var(--overlay-rgb), 0.12);
}

.template-preview[data-sidebar="left"] .preview-nav span,
.template-preview[data-sidebar="right"] .preview-nav span {
  min-height: 24px;
}

.preview-nav span:first-child {
  color: #fff;
  background: var(--preview-accent);
  box-shadow: 0 5px 12px rgba(var(--preview-accent-rgb), 0.16);
}

.preview-stage {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  gap: 13px;
  padding: 8px 9px;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 18px;
}

.preview-clock {
  width: 28px;
  height: 14px;
  border-radius: 999px;
  background:
      linear-gradient(90deg, rgba(var(--preview-accent-rgb), 0.22), rgba(var(--overlay-rgb), 0.12)),
      rgba(255, 255, 255, 0.16);
}

.preview-search {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: min(74%, 230px);
  height: 17px;
  padding: 0 8px;
  border-radius: 999px;
  color: rgba(var(--preview-accent-rgb), 0.68);
  background:
      linear-gradient(90deg, rgba(var(--preview-accent-rgb), 0.16), rgba(var(--preview-accent-rgb), 0.07)),
      rgba(255, 255, 255, 0.20);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.16) inset;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--preview-gap);
  align-items: center;
  justify-items: center;
}

.preview-site {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--preview-cell-size);
  height: var(--preview-cell-size);
  max-width: 100%;
  justify-self: center;
  border-radius: var(--preview-radius);
  color: rgb(var(--preview-item-rgb));
  background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 255, 255, 0.58)),
      rgba(var(--preview-item-rgb), 0.12);
  border: 1px solid rgba(var(--preview-item-rgb), 0.17);
  box-shadow:
      0 9px 16px rgba(15, 23, 42, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.30) inset;
}

.preview-site-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--preview-icon-size);
  height: var(--preview-icon-size);
  border-radius: calc(var(--preview-radius) * 0.72);
  color: #fff;
  background: rgb(var(--preview-item-rgb));
  box-shadow:
      0 7px 13px rgba(var(--preview-item-rgb), 0.22),
      0 1px 0 rgba(255, 255, 255, 0.22) inset;
}

.preview-site-icon :deep(svg) {
  width: 58%;
  height: 58%;
}

.preview-site-copy {
  display: none;
}

.template-preview[data-density="compact"] .preview-stage {
  gap: 8px;
  padding: 5px;
}

.template-preview[data-density="comfortable"] .preview-stage {
  gap: 14px;
  padding: 10px 12px;
}

.template-preview[data-mode="card"] .preview-grid {
  gap: max(6px, calc(var(--preview-gap) * 0.72));
}

.template-preview[data-mode="card"] .preview-site {
  width: 100%;
  height: 36px;
  border-radius: 8px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 9px;
  color: rgb(var(--preview-item-rgb));
  background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.80), rgba(255, 255, 255, 0.42)),
      rgba(var(--preview-item-rgb), 0.10);
  border-color: rgba(var(--preview-item-rgb), 0.17);
  box-shadow:
      0 7px 14px rgba(15, 23, 42, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.24) inset;
}

.template-preview[data-mode="card"] .preview-site-icon {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: #fff;
  background: rgb(var(--preview-item-rgb));
}

.template-preview[data-mode="card"] .preview-site-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.template-preview[data-mode="card"] .preview-site-copy {
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.template-preview[data-mode="card"] .preview-site-copy i,
.template-preview[data-mode="card"] .preview-site-copy b {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: rgba(var(--preview-item-rgb), 0.26);
}

.template-preview[data-mode="card"] .preview-site-copy i {
  width: 72%;
}

.template-preview[data-mode="card"] .preview-site-copy b {
  width: 46%;
  opacity: 0.72;
}

.preview-grid[data-card="1x1"] .preview-site {
  width: var(--preview-cell-size);
  height: var(--preview-cell-size);
  align-items: center;
  justify-content: center;
  padding: 0;
}

.preview-grid[data-card="1x1"] .preview-site-copy {
  display: none;
}

.template-preview[data-mode="card"] .preview-grid[data-card="1x1"] .preview-site {
  flex-direction: column;
  gap: 5px;
  color: rgb(var(--preview-item-rgb));
}

.template-preview[data-mode="card"] .preview-grid[data-card="1x1"] .preview-site-icon {
  width: 22px;
  height: 22px;
  flex-basis: 22px;
}

.template-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.template-title-copy {
  min-width: 0;
}

.template-audience {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 1.1;
  font-weight: 900;
  color: var(--accent-color);
}

.template-title-row h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.25;
  font-weight: 900;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.template-subline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.template-subline span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: var(--text-secondary);
  background: rgba(var(--overlay-rgb), 0.11);
  border: 1px solid rgba(var(--overlay-rgb), 0.09);
}

.active-label {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
}

.template-footer {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--overlay-rgb), 0.10);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.apply-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 70px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
  color: var(--accent-color);
  border: 1px solid rgba(var(--accent-color-rgb), 0.24);
  background: rgba(var(--accent-color-rgb), 0.10);
  transition: transform 0.16s ease, background 0.16s ease, border-color 0.16s ease;
}

.apply-action:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--accent-color-rgb), 0.38);
  background: rgba(var(--accent-color-rgb), 0.14);
}

.apply-action-active {
  color: #fff;
  border-color: transparent;
  background: var(--accent-color);
}

.animate-fade-in {
  animation: fadeIn 0.18s ease-out forwards;
}

@media (max-width: 680px) {
  .template-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .heading-status {
    max-width: 100%;
  }

  .template-grid {
    grid-template-columns: 1fr;
  }

  .template-option {
    min-height: auto;
  }
}

@media (min-width: 681px) and (max-width: 980px) {
  .template-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 420px) {
  .template-preview {
    min-height: 126px;
    aspect-ratio: auto;
  }

  .template-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .apply-action {
    width: 100%;
  }
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
</style>
