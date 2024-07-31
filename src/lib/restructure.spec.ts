import { describe, expect, it } from '@jest/globals';
import { TestScheduler } from 'rxjs/testing';
import { parse, recombineSession, startEndSplit } from './restructure';

const testScheduler = new TestScheduler((actual, expected) => {
  expect(actual).toEqual(expected);
});


describe('parse', () => {
  it('should parse a string', () => {
    const result = parse('foo');
    expect(result).toEqual(
      [
        { role: 'user' as const, content: 'foo' }
      ]
    );
  });

  it('should understand a system message when it comes first before the question', () => {
        
    expect(
    parse("replies are always in absurdly obscure language.\n\nQ>> \n\nwho was Patas Verdes? \n")
    ).toEqual(
      [
        { role: 'system' as const, content: 'replies are always in absurdly obscure language.' },
        { role: 'user' as const, content: 'who was Patas Verdes?' }
      ]
    )
  })
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

describe('recombineSession', () => {
  it('should recombine a session', () => {

    testScheduler.run(
      helpers => {
        const { cold, expectObservable } = helpers;
        const inputs = {
          a: [
            { role: 'user' as const, content: 'foo' },
            { role: 'assistant' as const, content: 'bar' },
            { role: 'user' as const, content: 'baz' }
          ], 
          b: [
            { role: 'system' as const, content: 'soo' },
            { role: 'user' as const, content: 'too' },
            { role: 'assistant' as const, content: 'aoo' },
          ], 
        }
        const source = cold('a-b-|', inputs).pipe(recombineSession());
        expectObservable(source)
          .toBe(
            'a-b-|', 
            {
              a: `foo\n\nA>>\n\nbar\n\nQ>>\n\nbaz\n\n`,
              b: `soo\n\nQ>>\n\ntoo\n\nA>>\n\naoo\n\n`
            }
          );
      }
    )
  })
});