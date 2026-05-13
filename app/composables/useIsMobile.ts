export function useIsMobile(maxWidth = 549.98) {
  const isMobile = ref(false)
  let mq: MediaQueryList | null = null

  function update() {
    if (mq) isMobile.value = mq.matches
  }

  onMounted(() => {
    mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    update()
    mq.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    mq?.removeEventListener('change', update)
  })

  return isMobile
}
