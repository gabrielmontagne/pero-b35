import { describe, expect, it } from '@jest/globals';
import { parseConversation } from './parse';


describe('parse', () => {
  it('should parse a string', () => {
    const result = parseConversation('foo');
    expect(result).toEqual('foo');
  });
});