// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { acceptedOverlaps, chainChecks, expectedChains } from './check-chains.ts';
import { tiers } from './model.ts';
import type { Ring } from './model.ts';
import type { Chains } from './steps/chains.ts';

const ringFrom = (west: number, east: number): Ring => [[west, 0], [east, 0], [east, 2], [west, 2], [west, 0]];

const builtChains = (): Chains => ({
  outlines: tiers.flatMap(tier => expectedChains[tier].map(id => ({ id, tier, ring: ringFrom(0, 2) }))),
  idsByTier: { sovereign: [...expectedChains.sovereign], defacto: [...expectedChains.defacto], dependencies: [...expectedChains.dependencies] },
  staleRulings: [],
  overlaps: [...acceptedOverlaps],
});

const failuresOf = (chains: Chains) => chainChecks(chains).flatMap(({ failures }) => failures);

describe('chainChecks', () => {
  it('passes chains with one outline each and only the accepted overlaps', () => {
    expect(failuresOf(builtChains())).toEqual([]);
  });

  it('fails when a chain has more than one outline', () => {
    const chains = builtChains();
    chains.outlines.push({ id: 'KIR', tier: 'sovereign', ring: ringFrom(10, 12) });

    expect(failuresOf(chains)).toEqual(['KIR has 2 outlines']);
  });

  it('fails when a chain has no outline', () => {
    const chains = builtChains();
    chains.outlines = chains.outlines.filter(({ id }) => id !== 'SHN');

    expect(failuresOf(chains)).toEqual(['SHN has 0 outlines']);
  });

  it('fails on an outline wider than 180°', () => {
    const chains = builtChains();
    chains.outlines.find(({ id }) => id === 'KIR')!.ring = ringFrom(-170, 170);

    expect(failuresOf(chains)).toEqual(['KIR is 340° wide']);
  });

  it('fails on an overlap outside the accepted pairs', () => {
    const chains = builtChains();
    chains.overlaps.push('COK-KIR');

    expect(failuresOf(chains)).toEqual(['COK-KIR overlap']);
  });

  it('fails on an accepted pair that no longer overlaps', () => {
    const chains = builtChains();
    const [cleared] = chains.overlaps.splice(0, 1);

    expect(failuresOf(chains)).toEqual([`${cleared} no longer overlap; remove the exception`]);
  });

  it('fails when one of the prototype sovereign chains is missing', () => {
    const chains = builtChains();
    chains.idsByTier.sovereign = chains.idsByTier.sovereign.filter(id => id !== 'TUV');
    chains.outlines = chains.outlines.filter(({ id }) => id !== 'TUV');

    expect(failuresOf(chains)).toEqual(['TUV is missing', 'sovereign: − TUV']);
  });
});
