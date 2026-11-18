import { describe, expect, it } from 'vitest';
import { boundsAround } from './boundsAround';

describe('boundsAround', () => {
  it('wraps the boxes of a region', () => {
    expect(boundsAround([[[10, 0], [20, 5]], [[15, -3], [30, 2]]])).toEqual([[10, -3], [30, 5]]);
  });

  it('keeps boxes on both sides of the antimeridian together', () => {
    expect(boundsAround([[[112, -40], [154, -10]], [[-176, -20], [-172, -15]]])).toEqual([[112, -40], [188, -10]]);
  });

  it('does not shift a region that lies west of the prime meridian', () => {
    expect(boundsAround([[[-80, 0], [-60, 10]], [[-40, -30], [-35, -20]]])).toEqual([[-80, -30], [-35, 10]]);
  });
});
