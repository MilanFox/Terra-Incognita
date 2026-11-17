const ROUND_STORAGE_KEY = 'ti:round';

export const hasStoredRound = () => localStorage.getItem(ROUND_STORAGE_KEY) !== null;

export const useAppUpdate = () => {
  const { $pwa } = useNuxtApp();
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

  const isUpdateReady = computed(() => Boolean($pwa?.needRefresh) && !isRoundStored.value && !isDismissed.value);

  const applyUpdate = () => $pwa?.updateServiceWorker();
  const dismissUpdate = () => {
    isDismissed.value = true;
  };

  return { isUpdateReady, applyUpdate, dismissUpdate, refreshRoundGate };
};
