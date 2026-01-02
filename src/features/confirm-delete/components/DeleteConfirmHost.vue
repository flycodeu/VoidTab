<script setup lang="ts">
import ConfirmDialog from '../../../shared/ui/dialogs/ConfirmDialog.vue';
import {useDeleteConfirm} from '../composables/useDeleteConfirm.ts';
import {PhTrash} from '@phosphor-icons/vue';

const del = useDeleteConfirm();
</script>

<template>
  <ConfirmDialog
      :show="del.show.value"
      :title="del.title.value"
      :message="del.message.value"
      confirmText="确认删除"
      cancelText="取消"
      :danger="true"
      @cancel="del.close"
      @confirm="del.confirm"
  >
    <template #icon>
      <PhTrash :size="32" weight="duotone"/>
    </template>
  </ConfirmDialog>
</template>
