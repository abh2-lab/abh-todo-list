<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

// The four dots on a card's sides. Drag from one to another card to draw a line.
// (Every dot can start or end a line: the board uses Vue Flow's "loose" connection mode.)
const sides = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
]
</script>

<template>
  <Handle
    v-for="s in sides"
    :id="s.id"
    :key="s.id"
    type="source"
    :position="s.position"
    class="board-handle"
    title="Drag to another card to draw a line"
  />
</template>
