export function isShortcutBlocked(event: KeyboardEvent) {
  return event.defaultPrevented || event.isComposing ||
    Boolean(document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) ||
    event.target instanceof Element && Boolean(event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]'))
}

export async function toggleAppFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await (document.querySelector<HTMLElement>('.player-viewport') ?? document.documentElement).requestFullscreen()
}
