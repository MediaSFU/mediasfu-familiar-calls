<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { mountFamiliarCall } from '../../whip-whep/src/main.js';
import '../../whip-whep/src/styles.css';

const host = ref<HTMLDivElement | null>(null);
let unmount: (() => void) | undefined;

onMounted(() => {
  if (host.value) unmount = mountFamiliarCall(host.value);
});
onBeforeUnmount(() => unmount?.());
</script>

<template><div ref="host" data-framework-host="vue" /></template>
