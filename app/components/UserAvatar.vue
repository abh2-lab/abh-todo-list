<script setup lang="ts">
// Google profile photo, or the first letter of the name if there is no photo.
const props = withDefaults(defineProps<{
  name?: string | null
  src?: string | null
  size?: number
}>(), { size: 22 })

const failed = ref(false)
watch(() => props.src, () => { failed.value = false })

const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase())
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    referrerpolicy="no-referrer"
    class="rounded-full object-cover shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="failed = true"
  />
  <span
    v-else
    class="rounded-full shrink-0 inline-flex items-center justify-center bg-[#1a1a2e] text-[#818cf8] font-medium select-none"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.45)}px` }"
  >
    {{ initial }}
  </span>
</template>
