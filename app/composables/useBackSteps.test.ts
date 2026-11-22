import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EffectScope } from 'vue';
import { useBackGuard, useBackStep } from './useBackSteps';

const settled = async () => {
  for (let turn = 0; turn < 3; turn++) await new Promise(resolve => setTimeout(resolve));
};

const pressBack = async () => {
  history.back();
  await settled();
};

const pressForward = async () => {
  history.forward();
  await settled();
};

const layer = () => {
  const isOpen = ref(false);
  const close = vi.fn(() => {
    isOpen.value = false;
  });
  return { isOpen, close, isActive: () => isOpen.value };
};

describe('back steps', () => {
  const routerState = { back: null, current: '/', forward: null, position: 1, replaced: true };
  let scopes: EffectScope[] = [];

  const run = (setup: () => void) => {
    const scope = effectScope();
    scope.run(setup);
    scopes.push(scope);
    return scope;
  };

  beforeEach(() => {
    history.pushState({ ...routerState }, '');
  });

  afterEach(() => {
    scopes.forEach(scope => scope.stop());
    scopes = [];
    vi.restoreAllMocks();
  });

  it('keeps one guard entry on top while layers are open, with vue-router\'s state and the URL left as they were', async () => {
    const settings = layer();
    const confirm = layer();
    const { length } = history;
    const url = location.href;
    run(() => {
      useBackGuard(() => true);
      useBackStep(settings.close, settings.isActive);
      useBackStep(confirm.close, confirm.isActive);
    });

    settings.isOpen.value = true;
    await settled();
    confirm.isOpen.value = true;
    await settled();

    expect(history.length).toBe(length + 1);
    expect(history.state).toMatchObject(routerState);
    expect(history.state).not.toEqual(routerState);
    expect(location.href).toBe(url);
  });

  it('steps back the most recently opened layer, then returns to the guard it left instead of pushing a new one', async () => {
    const bubble = layer();
    const stats = layer();
    run(() => {
      useBackGuard(() => true);
      useBackStep(bubble.close, bubble.isActive);
      useBackStep(stats.close, stats.isActive);
    });
    stats.isOpen.value = true;
    await settled();
    bubble.isOpen.value = true;
    await settled();
    const guardState = history.state;
    const { length } = history;
    const pushState = vi.spyOn(history, 'pushState');

    await pressBack();

    expect(bubble.close).toHaveBeenCalledOnce();
    expect(stats.close).not.toHaveBeenCalled();
    expect(history.state).toEqual(guardState);
    expect(history.length).toBe(length);
    expect(pushState).not.toHaveBeenCalled();

    await pressBack();

    expect(stats.close).toHaveBeenCalledOnce();
    expect(history.state).toEqual(routerState);
  });

  it('toggles a step that stays open under it, like the end-round card over a round', async () => {
    const endCard = layer();
    const askEnd = vi.fn(() => {
      endCard.isOpen.value = true;
    });
    run(() => {
      useBackGuard(() => true);
      useBackStep(askEnd);
      useBackStep(endCard.close, endCard.isActive);
    });
    await settled();
    const { length } = history;

    await pressBack();
    expect(askEnd).toHaveBeenCalledOnce();
    expect(endCard.isOpen.value).toBe(true);

    await pressBack();
    expect(endCard.close).toHaveBeenCalledOnce();
    expect(endCard.isOpen.value).toBe(false);

    await pressBack();
    expect(askEnd).toHaveBeenCalledTimes(2);
    expect(history.length).toBe(length);
    expect(history.state).not.toEqual(routerState);
  });

  it('gives the guard up when the last layer closes on its own, so the next back press leaves and forward does nothing', async () => {
    const settings = layer();
    run(() => {
      useBackGuard(() => true);
      useBackStep(settings.close, settings.isActive);
    });
    settings.isOpen.value = true;
    await settled();

    settings.isOpen.value = false;
    await settled();

    expect(history.state).toEqual(routerState);

    await pressForward();

    expect(history.state).toEqual(routerState);
    expect(settings.close).not.toHaveBeenCalled();
  });

  it('keeps the guard when a close opens another layer a tick later', async () => {
    const setup = layer();
    const homeTray = layer();
    run(() => {
      useBackGuard(() => true);
      useBackStep(setup.close, setup.isActive);
      useBackStep(homeTray.close, homeTray.isActive);
    });
    setup.isOpen.value = true;
    await settled();
    const guardState = history.state;
    const go = vi.spyOn(history, 'go');

    setup.isOpen.value = false;
    await nextTick();
    homeTray.isOpen.value = true;
    await settled();

    expect(go).not.toHaveBeenCalled();
    expect(history.state).toEqual(guardState);
  });

  it('after a reload on the guard, keeps it for a resumed round and gives it up once the app is ready with nothing open', async () => {
    const round = layer();
    const beforeReload = run(() => {
      useBackGuard(() => true);
      useBackStep(round.close, round.isActive);
    });
    round.isOpen.value = true;
    await settled();
    beforeReload.stop();
    const guardState = history.state;
    const pushState = vi.spyOn(history, 'pushState');

    const isReady = ref(false);
    const resumedRound = layer();
    run(() => {
      useBackGuard(() => isReady.value);
      useBackStep(resumedRound.close, resumedRound.isActive);
    });
    await settled();
    expect(history.state).toEqual(guardState);

    resumedRound.isOpen.value = true;
    isReady.value = true;
    await settled();
    expect(history.state).toEqual(guardState);
    expect(pushState).not.toHaveBeenCalled();

    await pressBack();
    expect(resumedRound.close).toHaveBeenCalledOnce();
    expect(history.state).toEqual(routerState);
  });

  it('gives up a guard left from before a reload when the app is ready with nothing open', async () => {
    const settings = layer();
    const beforeReload = run(() => {
      useBackGuard(() => true);
      useBackStep(settings.close, settings.isActive);
    });
    settings.isOpen.value = true;
    await settled();
    beforeReload.stop();

    const isReady = ref(false);
    run(() => useBackGuard(() => isReady.value));
    await settled();
    expect(history.state).not.toEqual(routerState);

    isReady.value = true;
    await settled();
    expect(history.state).toEqual(routerState);
  });
});
