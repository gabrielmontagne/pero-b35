import { describe, expect, it } from 'vitest'
import { parseFlat } from './restructure'
import {
  entriesToSession,
  jsonlToFlat,
  jsonlToSession,
  sessionToEntries,
  sessionToJsonl,
} from './session-codec'
import { Session } from './scan'

const zeroUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
}

function assistantMessage(entries: any[]) {
  return entries.find(
    (entry) => entry.type === 'message' && entry.message?.role === 'assistant'
  )
}

describe('session-codec', () => {
  it('should handle a simple conversation roundtrip', () => {
    const session: Session = [
      { role: 'user', content: 'Hello world' },
      { role: 'assistant', content: 'Hi there!' },
    ]

    const recovered = jsonlToSession(sessionToJsonl(session))

    expect(recovered).toHaveLength(2)
    expect(recovered[0].role).toBe('user')
    expect(recovered[0].content).toBe('Hello world')
    expect(recovered[1].role).toBe('assistant')
    expect(recovered[1].content).toBe('Hi there!')
  })

  it('should keep image tags literal and drop system text', () => {
    const flat = [
      'S>>',
      '',
      'stay on your side',
      '',
      'Q>>',
      '',
      'look at [img[/tmp/no-such.png]]',
      '',
    ].join('\n')

    const session = parseFlat(flat)
    const entries = sessionToEntries(session)
    const user = entries.find(
      (entry) => entry.type === 'message' && entry.message?.role === 'user'
    )

    expect(session.map((message) => message.role)).toEqual(['system', 'user'])
    expect(entries.filter((entry) => entry.type === 'message')).toHaveLength(1)
    expect(user?.message.content).toBe('look at [img[/tmp/no-such.png]]')
  })

  it('should handle conversations with reasoning blocks', () => {
    const session: Session = [
      { role: 'user', content: 'What is 2+2?' },
      {
        role: 'assistant',
        content: '@@.think\nI need to add 2 and 2\n@@\n\n2+2 equals 4',
      },
    ]

    const entries = sessionToEntries(session)
    const assistant = assistantMessage(entries)

    expect(assistant.message.content).toContainEqual({
      type: 'thinking',
      thinking: 'I need to add 2 and 2',
    })
    expect(assistant.message.content).toContainEqual({
      type: 'text',
      text: '2+2 equals 4',
    })

    const recovered = entriesToSession(entries)
    expect((recovered[1] as any).reasoning).toBe('I need to add 2 and 2')
    expect(recovered[1].content).toBe('2+2 equals 4')
  })

  it('should emit a pi session header and a null-rooted chain', () => {
    const entries = sessionToEntries([{ role: 'user', content: 'Test' }], {
      cwd: '/test',
      model: 'test-model',
    })

    expect(entries[0]).toMatchObject({
      type: 'session',
      version: 3,
      cwd: '/test',
    })
    expect(entries[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(entries[0].parentId).toBeUndefined()
    expect(entries[1]).toMatchObject({
      type: 'message',
      parentId: null,
      message: { role: 'user', content: 'Test' },
    })
  })

  it('should include placeholder metadata for assistant messages', () => {
    const entries = sessionToEntries(
      [
        { role: 'user', content: 'Test' },
        { role: 'assistant', content: 'Response' },
      ],
      { model: 'test-model' }
    )
    const assistant = assistantMessage(entries)

    expect(assistant.parentId).toBe(entries[1].id)
    expect(assistant.message).toMatchObject({
      provider: 'pero',
      model: 'test-model',
      api: 'openai-completions',
      stopReason: 'stop',
      usage: zeroUsage,
    })
  })

  it('should import the current leaf and drop the other branch', () => {
    const jsonl = [
      header(),
      message('u1', null, { role: 'user', content: 'root', timestamp: 1 }),
      message('a-left', 'u1', assistant('left')),
      message('u2', 'u1', { role: 'user', content: 'right', timestamp: 3 }),
      message('a-right', 'u2', assistant('right answer')),
    ].join('\n')

    const recovered = jsonlToSession(jsonl)

    expect(recovered.map((item) => item.content)).toEqual([
      'root',
      'right',
      'right answer',
    ])
  })

  it('should honor compaction and render tool results as @@.tools', () => {
    const jsonl = [
      header(),
      message('old', null, {
        role: 'user',
        content: 'forgotten',
        timestamp: 1,
      }),
      message('kept', 'old', { role: 'user', content: 'kept', timestamp: 2 }),
      line({
        type: 'compaction',
        id: 'comp',
        parentId: 'kept',
        timestamp: '2026-06-14T00:00:03.000Z',
        summary: 'earlier work',
        firstKeptEntryId: 'kept',
        tokensBefore: 10,
      }),
      message('a1', 'comp', {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'check the dir' },
          { type: 'text', text: 'looking' },
          {
            type: 'toolCall',
            id: 'call-1',
            name: 'bash',
            arguments: { command: 'ls' },
          },
        ],
        api: 'openai-completions',
        provider: 'openrouter',
        model: 'x',
        usage: zeroUsage,
        stopReason: 'toolUse',
        timestamp: 4,
      }),
      message('t1', 'a1', {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: 'file.txt' }],
        isError: false,
        timestamp: 5,
      }),
      message('sys', 't1', {
        role: 'system',
        content: 'infra',
        timestamp: 6,
      }),
    ].join('\n')

    const recovered = jsonlToSession(jsonl)
    expect(recovered.map((item) => item.role)).toEqual([
      'assistant',
      'user',
      'assistant',
    ])
    expect(recovered[0].content).toContain('earlier work')
    expect(recovered.map((item) => item.content).join('\n')).not.toContain(
      'forgotten'
    )
    expect(recovered[2].content).toContain('@@.tools')
    expect(recovered[2].content).toContain('bash')
    expect(recovered[2].content).toContain('file.txt')
    expect(recovered[2].content).toContain('looking')
    expect((recovered[2] as any).reasoning).toBe('check the dir')

    const flat = jsonlToFlat(jsonl)
    expect(flat).toContain('@@.think')
    expect(flat).toContain('Q>>')
    expect(flat).not.toContain('infra')
    expect(flat.trimEnd().endsWith('Q>>')).toBe(true)
  })
})

function line(entry: unknown) {
  return JSON.stringify(entry)
}

function header() {
  return line({
    type: 'session',
    version: 3,
    id: 'sess',
    timestamp: '2026-06-14T00:00:00.000Z',
    cwd: '/tmp',
  })
}

function message(id: string, parentId: string | null, body: any) {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp: '2026-06-14T00:00:01.000Z',
    message: body,
  })
}

function assistant(text: string) {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'x',
    model: 'y',
    usage: zeroUsage,
    stopReason: 'stop',
    timestamp: 1,
  }
}
