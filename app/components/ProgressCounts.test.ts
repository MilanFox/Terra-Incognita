import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import type { ProgressCell } from '#shared/game/game';
import ProgressCounts from './ProgressCounts.vue';

describe('progress counts', () => {
  it('shows how many prompts went right, wrong and missed, how far through the deck the round is, and says all of it once', async () => {
    const progress: ProgressCell[] = ['right', 'wrong', 'right', 'missed', 'right', 'current', ...Array<ProgressCell>(14).fill('pending')];
    const tile = await mountSuspended(ProgressCounts, { props: { progress, promptNumber: 6 } });

    expect(tile.attributes('role')).toBe('img');
    expect(tile.attributes('aria-label')).toBe('Prompt 6 of 20, 3 right, 1 wrong, 1 missed');
    expect(tile.findAll('.progress-counts__outcome').map(outcome => outcome.text())).toEqual(['✓3', '✗1', '–1']);
    expect(tile.find('.progress-counts__number').text()).toBe('6/20');
    expect(tile.find<HTMLElement>('.progress-counts__fill').element.style.width).toBe('25%');
    expect(tile.findAll(':scope > *').map(part => part.attributes('aria-hidden'))).toEqual(['true', 'true']);
  });
});
