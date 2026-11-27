import type { Ref } from 'vue';

// The dialog is the page's map scope, which also holds the live region; Tab is stepped by hand so it only cycles through the tray's overlay and the map.
export const useTrayFocusCycle = (overlay: Ref<HTMLElement | null>, mapCanvas: () => HTMLElement | null | undefined) => {
  const focusCycle = () => {
    const inTray = [...overlay.value?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]') ?? []]
      .filter(element => !element.closest('[inert]') && element.getClientRects().length > 0);
    const canvas = mapCanvas();
    return canvas ? [...inTray, canvas] : inTray;
  };

  return (event: KeyboardEvent) => {
    const cycle = focusCycle();
    const active = document.activeElement as HTMLElement | null;
    if (cycle.length === 0) return;
    event.preventDefault();
    const index = active ? cycle.indexOf(active) : -1;
    if (index !== -1) {
      cycle[(index + (event.shiftKey ? cycle.length - 1 : 1)) % cycle.length]!.focus();
      return;
    }
    const isInTray = !!active && !!overlay.value?.contains(active);
    const following = isInTray ? cycle.filter(element => active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) : [];
    const preceding = isInTray ? cycle.filter(element => !following.includes(element)) : [];
    (event.shiftKey ? preceding.at(-1) ?? cycle.at(-1) : following[0] ?? cycle[0])!.focus();
  };
};
