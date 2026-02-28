<script setup lang="ts">
import {onBeforeUnmount, ref} from 'vue';
import {
  PhArrowSquareOut,
  PhCheck,
  PhCode,
  PhCopy,
  PhGithubLogo,
  PhGlobe,
  PhInfo,
  PhUserCircle,
  PhWarning
} from '@phosphor-icons/vue';

const githubUrl = 'https://github.com/flycodeu/VoidTab';
const blogUrl = 'https://www.flycodeu.icu';
const wechatId = 'flycodehub';
const copyState = ref<'idle' | 'success' | 'error'>('idle');

const content = {
  heroTitle: '\u4f5c\u8005\u4ecb\u7ecd',
  heroSubtitle: '\u611f\u8c22\u4f7f\u7528 VoidTab\uff0c\u6b22\u8fce Star\uff0c\u4e5f\u6b22\u8fce\u4ea4\u6d41\u95ee\u9898\u4e0e\u60f3\u6cd5\u3002',
  identityItems: [
    {label: '\u4f5c\u8005', value: '\u7a0b\u5e8f\u5458\u98de\u4e91'},
    {label: '\u9879\u76ee', value: 'VoidTab'}
  ],
  stackLabel: '\u6280\u672f\u6808',
  stackValue: 'Java / Spring Boot / Python',
  linksTitle: '\u9879\u76ee\u4e0e\u5185\u5bb9',
  githubTitle: 'GitHub \u9879\u76ee',
  githubDesc: '\u67e5\u770b\u6700\u65b0\u66f4\u65b0\u3001\u63d0\u4ea4 Issue \u4e0e PR',
  blogTitle: '\u4e2a\u4eba\u535a\u5ba2\u7f51\u7ad9',
  blogDesc: '\u5206\u4eab\u5f00\u53d1\u5b9e\u8df5\u4e0e\u7f16\u7a0b\u6587\u7ae0',
  contactTitle: '\u8054\u7cfb\u4f5c\u8005',
  contactLead: '\u5fae\u4fe1\u4ea4\u6d41',
  contactHint: '\u6709\u95ee\u9898\u6216\u5efa\u8bae\u53ef\u4ee5\u6dfb\u52a0\u5fae\u4fe1\uff1a',
  copyWechat: '\u590d\u5236\u5fae\u4fe1\u53f7',
  footer: '\u611f\u8c22\u652f\u6301 VoidTab\uff0c\u6b22\u8fce Star \u4e0e\u53cd\u9988\u5efa\u8bae\u3002',
  copySuccess: '\u5fae\u4fe1\u53f7\u5df2\u590d\u5236',
  copyFail: '\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u590d\u5236 flycodehub'
};

let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer);
});

const resetCopyState = () => {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    copyState.value = 'idle';
  }, 2200);
};

const fallbackCopy = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  let success = false;
  try {
    success = document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
  return success;
};

const copyWechat = async () => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(wechatId);
      copyState.value = 'success';
      resetCopyState();
      return;
    }
    copyState.value = fallbackCopy(wechatId) ? 'success' : 'error';
  } catch {
    copyState.value = 'error';
  }
  resetCopyState();
};
</script>

<template>
  <div class="author-page animate-fade-in">
    <section class="section-card hero-section">
      <div class="hero-head">
        <div class="avatar-badge">
          <PhUserCircle size="22" weight="duotone"/>
        </div>
        <div class="hero-copy">
          <h3 class="hero-title">{{ content.heroTitle }}</h3>
          <p class="hero-subtitle">{{ content.heroSubtitle }}</p>
        </div>
      </div>

      <div class="facts-grid">
        <article
          v-for="item in content.identityItems"
          :key="item.label"
          class="fact-item"
        >
          <p class="fact-label">{{ item.label }}</p>
          <p class="fact-value">{{ item.value }}</p>
        </article>
      </div>

      <div class="stack-row">
        <span class="fact-label">{{ content.stackLabel }}</span>
        <span class="stack-value">
          <PhCode size="13" weight="bold"/>
          <span>{{ content.stackValue }}</span>
        </span>
      </div>
    </section>

    <section class="section-card">
      <h4 class="section-title">{{ content.linksTitle }}</h4>

      <a :href="githubUrl" target="_blank" rel="noopener noreferrer" class="action-btn action-primary">
        <span class="action-main">
          <PhGithubLogo size="18" weight="fill"/>
          <span>{{ content.githubTitle }}</span>
        </span>
        <PhArrowSquareOut size="16" class="action-icon"/>
      </a>

      <p class="action-desc">{{ content.githubDesc }}</p>

      <a :href="blogUrl" target="_blank" rel="noopener noreferrer" class="action-btn action-secondary">
        <span class="action-main">
          <PhGlobe size="18" weight="duotone"/>
          <span>{{ content.blogTitle }}</span>
        </span>
        <PhArrowSquareOut size="16" class="action-icon"/>
      </a>

      <p class="action-desc">{{ content.blogDesc }}</p>
      <p class="meta-line">GitHub: <a :href="githubUrl" target="_blank" rel="noopener noreferrer" class="meta-link">{{ githubUrl }}</a></p>
      <p class="meta-line">博客: <a :href="blogUrl" target="_blank" rel="noopener noreferrer" class="meta-link">{{ blogUrl }}</a></p>
    </section>

    <section class="section-card">
      <h4 class="section-title">{{ content.contactTitle }}</h4>

      <p class="contact-lead">{{ content.contactLead }}</p>
      <p class="wechat-id">{{ wechatId }}</p>
      <p class="meta-line">{{ content.contactHint }}{{ wechatId }}</p>

      <button
        @click="copyWechat"
        class="action-btn action-secondary"
        type="button"
      >
        <span class="action-main">
          <PhCopy size="16" weight="bold"/>
          <span>{{ content.copyWechat }}</span>
        </span>
      </button>

      <div class="feedback-wrap" role="status" aria-live="polite">
        <div
          v-if="copyState !== 'idle'"
          class="feedback"
          :class="copyState === 'success' ? 'ok' : 'fail'"
        >
          <component :is="copyState === 'success' ? PhCheck : PhWarning" size="15" weight="fill"/>
          <span>{{ copyState === 'success' ? content.copySuccess : content.copyFail }}</span>
        </div>
      </div>
    </section>

    <p class="foot-note">
      <PhInfo size="14" weight="duotone"/>
      <span>{{ content.footer }}</span>
    </p>
  </div>
</template>

<style scoped>
.author-page {
  color: var(--settings-text);
  width: 100%;
  max-width: 860px;
  margin-inline: auto;
  display: grid;
  gap: 0.75rem;
}

.section-card {
  border-radius: 0.96rem;
  border: 1px solid var(--settings-border);
  background: var(--settings-panel);
  box-shadow: var(--settings-shadow-soft);
  padding: 0.92rem;
  display: grid;
  gap: 0.58rem;
}

.hero-section {
  gap: 0.7rem;
}

.hero-head {
  display: flex;
  align-items: flex-start;
  gap: 0.64rem;
  min-width: 0;
}

.avatar-badge {
  width: 2rem;
  height: 2rem;
  border-radius: 0.58rem;
  display: grid;
  place-items: center;
  flex: none;
  color: var(--accent-color);
  background: rgba(var(--accent-color-rgb), 0.12);
  border: 1px solid rgba(var(--accent-color-rgb), 0.26);
}

.hero-copy {
  min-width: 0;
}

.hero-title {
  font-size: 1.02rem;
  line-height: 1.3;
  font-weight: 800;
}

.hero-subtitle {
  margin-top: 0.2rem;
  font-size: 0.83rem;
  line-height: 1.58;
  color: var(--settings-text-secondary);
  max-width: 60ch;
}

.facts-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
}

.fact-item {
  border-radius: 0.72rem;
  border: 1px solid color-mix(in srgb, var(--settings-border) 86%, rgba(var(--accent-color-rgb), 0.16));
  background: color-mix(in srgb, var(--settings-panel) 95%, rgba(var(--accent-color-rgb), 0.04));
  padding: 0.5rem 0.58rem;
}

.fact-label {
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--settings-text-secondary);
}

.fact-value {
  margin-top: 0.16rem;
  font-size: 0.9rem;
  line-height: 1.4;
  font-weight: 700;
}

.stack-row {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  min-width: 0;
  flex-wrap: wrap;
}

.stack-value {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--settings-text);
  font-weight: 600;
  min-width: 0;
  overflow-wrap: anywhere;
}

.section-title {
  font-size: 0.78rem;
  line-height: 1.35;
  font-weight: 700;
  color: var(--settings-text-secondary);
}

.meta-line {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--settings-text-secondary);
  max-width: 58ch;
  overflow-wrap: anywhere;
}

.meta-link {
  color: color-mix(in srgb, var(--settings-text-secondary) 65%, var(--settings-text));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.meta-link:hover {
  color: var(--settings-text);
}

.contact-lead {
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--settings-text-secondary);
}

.wechat-id {
  font-size: 1rem;
  line-height: 1.35;
  font-weight: 760;
  overflow-wrap: anywhere;
}

.action-btn {
  width: 100%;
  border-radius: 0.74rem;
  border: 1px solid var(--settings-border);
  min-height: 2.6rem;
  padding: 0.56rem 0.7rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.84rem;
  line-height: 1.4;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.action-btn:hover {
  border-color: color-mix(in srgb, var(--settings-border) 68%, rgba(var(--accent-color-rgb), 0.34));
}

.action-btn:focus-visible,
.meta-link:focus-visible {
  outline: 2px solid rgba(var(--accent-color-rgb), 0.52);
  outline-offset: 2px;
}

.action-main {
  display: inline-flex;
  align-items: center;
  gap: 0.44rem;
}

.action-icon {
  opacity: 0.72;
}

.action-primary {
  background: var(--accent-color);
  color: var(--accent-ink, #ffffff);
  border-color: rgba(var(--accent-color-rgb), 0.9);
}

.action-primary .action-icon {
  color: color-mix(in srgb, currentColor 78%, transparent);
}

.action-secondary {
  background: color-mix(in srgb, var(--settings-panel) 96%, rgba(var(--accent-color-rgb), 0.06));
  color: var(--settings-text);
}

.action-desc {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--settings-text-secondary);
  margin-top: -0.1rem;
  margin-bottom: 0.16rem;
  max-width: 58ch;
}

.feedback-wrap {
  min-height: 1.4rem;
}

.feedback {
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  font-size: 0.76rem;
  line-height: 1.38;
  font-weight: 700;
}

.feedback.ok {
  color: #22c55e;
}

.feedback.fail {
  color: #ef4444;
}

.foot-note {
  margin-top: 0.22rem;
  display: flex;
  align-items: flex-start;
  gap: 0.32rem;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--settings-text-secondary);
  max-width: 62ch;
}

.animate-fade-in {
  animation: fadeIn 0.26s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (min-width: 620px) {
  .section-card {
    padding: 1rem;
  }

  .facts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in {
    animation: none;
  }

  .action-btn {
    transition: none;
  }
}
</style>
