<script setup lang="ts">
// The numbers of a chart as a plain table: the same numbers, to read without the chart.
defineProps<{ columns: string[]; rows: (string | number)[][] }>()
</script>

<template>
  <table class="w-full text-xs tabular-nums">
    <thead>
      <tr class="text-2xs text-[#777]">
        <th
          v-for="(c, i) in columns"
          :key="c"
          scope="col"
          class="py-1.5 px-2 font-normal whitespace-nowrap"
          :class="i ? 'text-right' : 'text-left'"
        >
          {{ c }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, ri) in rows" :key="ri" class="border-t border-[#141414]">
        <td
          v-for="(v, i) in r"
          :key="i"
          class="py-1.5 px-2"
          :class="i ? 'text-right text-[#ddd]' : 'text-left text-[#aaa] whitespace-nowrap'"
        >
          {{ v }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
