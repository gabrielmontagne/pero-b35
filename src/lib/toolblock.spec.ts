import { describe, it, expect } from 'vitest'
import { extractLastToolPhase, makeToolsBlock } from './toolblock'
import { Session } from './scan'
import { of, firstValueFrom } from 'rxjs'
import { recombineWithOriginal } from './restructure'

describe('toolblock', () => {
  it('extracts last tool phase and builds a result block', () => {
    const session: Session = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search_web', arguments: '{"query":"berlin"}' },
          },
        ],
      } as any,
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'search_web',
        content: 'Result line 1\nResult line 2',
      } as any,
      { role: 'assistant', content: 'Final answer' },
    ]

    const entries = extractLastToolPhase(session)
    expect(entries.length).toBe(1)
    expect(entries[0].name).toBe('search_web')
    expect(entries[0].params.query).toBe('berlin')

    const block = makeToolsBlock(entries, {
      mode: 'result',
      maxPerResultChars: 2000,
      maxTotalChars: 6000,
    })
    expect(block).toContain('@@.tools')
    expect(block).toContain('- search_web:')
    expect(block).toContain('query: berlin')
    expect(block).toContain('result: |')
  })

  it('integrates with recombineWithOriginal at top placement', async () => {
    const session: Session = [
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search_web', arguments: '{"query":"berlin"}' },
          },
        ],
      } as any,
      {
        role: 'tool',
        tool_call_id: 'call_1',
        name: 'search_web',
        content: 'Result text',
      } as any,
      { role: 'assistant', content: 'Final answer' },
    ]

    const output$ = of(session).pipe(
      recombineWithOriginal({
        original: 'S>>\n\nSystem\n\nQ>>\n\nhi',
        outputOnly: false,
        includeReasoning: false,
        includeTool: 'result',
        toolsPlacement: 'top',
      })
    )

    const s = await firstValueFrom(output$)
    expect(s).toContain('@@.tools')
    expect(s.indexOf('@@.tools')).toBeLessThan(s.indexOf('Final answer'))
  })
})
