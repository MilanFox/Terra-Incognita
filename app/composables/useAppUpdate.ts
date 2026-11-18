import { useGameStore } from '~/stores/game';

const ROUND_STORAGE_KEY = 'ti:round';

export const hasStoredRound = () => localStorage.getItem(ROUND_STORAGE_KEY) !== null;

export const useAppUpdate = () => {
  const { $pwa } = useNuxtApp();
  const game = useGameStore();
  const isRoundStored = ref(hasStoredRound());
  const isDismissed = ref(false);

  const refreshRoundGate = () => {
    isRoundStored.value = hasStoredRound();
  };

  const checkForUpdate = () => {
    $pwa?.getSWRegistration()?.update().catch(() => {});
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    refreshRoundGate();
    checkForUpdate();
  };

  onMounted(() => {
    checkForUpdate();
  });
  useEventListener(document, 'visibilitychange', handleVisibilityChange);
  useEventListener(window, 'storage', refreshRoundGate);
  watch(() => game.state, refreshRoundGate);

  const isUpdateReady = computed(() => Boolean($pwa?.needRefresh) && !isRoundStored.value && !isDismissed.value);

  // vite-pwa only reloads pages a service worker controlled at load; others would stay on the old version.
  const applyUpdate = () => {
    const waitingWorker = $pwa?.getSWRegistration()?.waiting;
    if (!waitingWorker) {
      window.location.reload();
      return;
    }
    waitingWorker.addEventListener('statechange', () => {
      if (waitingWorker.state === 'activated') window.location.reload();
    });
    $pwa?.updateServiceWorker();
  };
  const dismissUpdate = () => {
    isDismissed.value = true;
  };

  return { isUpdateReady, applyUpdate, dismissUpdate, refreshRoundGate };
};
