<script setup lang="ts">
import { computed } from 'vue';
import { PhMonitor } from '@phosphor-icons/vue';
import { useConfigStore } from '../../stores/useConfigStore';

const store = useConfigStore();

const logoUrl = computed(() => (store.config.theme as any).customLogoUrl || '');
</script>

<template>
  <div class="brand-logo">
    <img
        v-if="logoUrl"
        :src="logoUrl"
        class="brand-logo-img"
        alt="logo"
        draggable="false"
    />
    <PhMonitor v-else weight="fill" size="20" />
  </div>
</template>

<style scoped>
.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 4px;
}
</style>
