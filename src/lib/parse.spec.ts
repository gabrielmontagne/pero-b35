import { describe, expect, it } from '@jest/globals';
import { parseMessages } from './parse';


describe('parse', () => {
  it('should parse a string', () => {
    const result = parseMessages('foo');
    expect(result).toEqual(
    [
        { role: 'user' as const, content: 'foo' }
    ]
    );
  });
});