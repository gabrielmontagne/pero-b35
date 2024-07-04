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
__START__
BBBB
__END__
CCCC`);
    expect(result).toEqual(
      {
        leading: 'AAAA\n',
        main: 'BBBB\n',
        trailing: 'CCCC'
      }
    );
  });

  it('should use the last __START__ as leading, when there are multiple', () => {
    const result = startEndSplit(
`AAAA
__START__
BBBB
__START__
CCCC`);
    expect(result).toEqual(
      {
        leading: 'AAAA\n__START__\nBBBB\n',
        main: 'CCCC'
      }
    );
  });

  it('should use the first __END__ as trailing, when there are multiple', () => {
    const result = startEndSplit(
`AAAA
BBBB
__END__
CCCC
__END__
DDDD`);
    expect(result).toEqual(
      {
        main: 'AAAA\nBBBB\n',
        trailing: 'CCCC\n__END__\nDDDD'
      }
    );
  });
});