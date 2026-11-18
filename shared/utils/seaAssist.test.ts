import { describe, expect, it } from 'vitest';
import { seaAssistPlaceId } from './seaAssist';

const tuvalu = { placeId: 'TUV', x: 100, y: 100, speckZoom: 6 };
const nauru = { placeId: 'NRU', x: 130, y: 100, speckZoom: 6.5 };

describe('seaAssistPlaceId', () => {
  it('catches a tap on the water right next to a tiny place', () => {
    expect(seaAssistPlaceId({ x: 115, y: 108 }, [tuvalu], 3)).toBe('TUV');
  });

  it('leaves a tap farther out than the assist radius', () => {
    expect(seaAssistPlaceId({ x: 100, y: 123 }, [tuvalu], 3)).toBeUndefined();
  });

  it('takes the nearest of two tiny places', () => {
    expect(seaAssistPlaceId({ x: 118, y: 100 }, [tuvalu, nauru], 3)).toBe('NRU');
  });

  it('lets go once the land is as wide as the assist circle', () => {
    expect(seaAssistPlaceId({ x: 105, y: 100 }, [tuvalu], 6 + Math.log2(22) - 0.01)).toBe('TUV');
    expect(seaAssistPlaceId({ x: 105, y: 100 }, [tuvalu], 6 + Math.log2(22) + 0.01)).toBeUndefined();
  });
});
