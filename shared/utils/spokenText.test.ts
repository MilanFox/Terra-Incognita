import { describe, expect, it } from 'vitest';
import { withoutDoubledFullStops } from './spokenText';

describe('spoken text', () => {
  it('lets a name ending in a full stop close the sentence', () => {
    expect(withoutDoubledFullStops('The answer is Washington, D.C.. Press Next.')).toBe('The answer is Washington, D.C. Press Next.');
    expect(withoutDoubledFullStops('Richtig: Washington, D.C..')).toBe('Richtig: Washington, D.C.');
  });

  it('leaves single full stops and ellipses alone', () => {
    expect(withoutDoubledFullStops('Wrong. You tapped Niger. The answer is Chad. Press Next.')).toBe('Wrong. You tapped Niger. The answer is Chad. Press Next.');
    expect(withoutDoubledFullStops('Next daily in ...')).toBe('Next daily in ...');
  });
});
