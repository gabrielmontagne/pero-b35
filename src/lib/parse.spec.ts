import { describe, expect, it } from '@jest/globals';
import { parse } from './parse';


describe('parse', () => {
  it('should parse a string', () => {
    const result = parse('foo');
    expect(result).toEqual(
    [
        { role: 'user' as const, content: 'foo' }
    ]
    );
  });
});