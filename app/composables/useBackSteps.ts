interface BackStep {
  stepBack: () => unknown
  isActive: () => boolean
  activatedAt: number
}

const guardKey = 'backGuard';
const steps = shallowReactive(new Set<BackStep>());
let activationCount = 0;

const topStep = () => [...steps].filter(step => step.isActive()).sort((a, b) => b.activatedAt - a.activatedAt)[0];

export const useBackStep = (stepBack: () => unknown, isActive: () => boolean = () => true) => {
  const step: BackStep = { stepBack, isActive, activatedAt: 0 };
  watch(isActive, (active) => {
    if (active) step.activatedAt = ++activationCount;
  }, { immediate: true, flush: 'sync' });
  steps.add(step);
  onScopeDispose(() => steps.delete(step));
};

export const useBackGuard = (isReady: () => boolean) => {
  const isAway = computed(() => [...steps].some(step => step.isActive()));
  let isArmed = !!history.state?.[guardKey];
  let isGuardAhead = false;
  let isTraversing = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const traverse = (delta: 1 | -1) => {
    isTraversing = true;
    history.go(delta);
  };

  const sync = () => {
    if (isTraversing || !isReady()) return;
    // Back onto the guard a back press just left: Chrome skips an entry on back once a new one is pushed from it without a fresh user activation.
    if (isAway.value && !isArmed && isGuardAhead) traverse(1);
    else if (isAway.value && !isArmed) {
      history.pushState({ ...history.state, [guardKey]: true }, '');
      isArmed = true;
    }
    else if (!isAway.value && isArmed) traverse(-1);
    isGuardAhead = false;
  };

  // Deferred past the layers' own nextTick steps, so a close that opens another layer (setup giving way to the expanded home tray) keeps the guard.
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(sync);
  };

  watch([isAway, isReady], settle, { immediate: true });

  useEventListener(window, 'popstate', () => {
    const isOnGuard = !!history.state?.[guardKey];
    if (isArmed && !isOnGuard && !isTraversing) {
      isGuardAhead = true;
      topStep()?.stepBack();
    }
    isArmed = isOnGuard;
    isTraversing = false;
    settle();
  });

  onScopeDispose(() => clearTimeout(settleTimer));
};
