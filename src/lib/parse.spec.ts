import { describe, expect, it } from '@jest/globals';
import { parse, startEndSplit } from './parse';


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

describe('startEndSplit', () => {
  it('should split a string into leading, main, and trailing', () => {
    const result = startEndSplit('foo');
    expect(result).toEqual(
      { main: 'foo' }
    );
  });

  it('should split a string into leading, main, and trailing', () => {
    const result = startEndSplit(
`AAAA
___START___
BBBB
___END___
CCCC`);
    expect(result).toEqual(
      {
        leading: 'AAAA\n',
        main: 'BBBB\n',
        trailing: 'CCCC'
      }
    );
  });
});