import { describe, expect, it } from 'vitest'
import { completionGateways, gatewayConfigs, gateways } from './gateways'
import { stripComments } from './run-complete'

describe('stripComments', () => {
  it('removes %%% comment lines', () => {
    expect(stripComments('%%% note\nhello\n%%% another\nworld')).toBe(
      'hello\nworld'
    )
  })

  it('leaves ordinary text alone', () => {
    expect(stripComments('hello world')).toBe('hello world')
  })

  it('does not strip mid-line %%%', () => {
    expect(stripComments('a %%% b')).toBe('a %%% b')
  })
})

describe('gateway registry', () => {
  it('exposes every configured gateway', () => {
    expect(gateways).toContain('openrouter')
    expect(gateways).toContain('featherless')
    expect(gateways.length).toBe(Object.keys(gatewayConfigs).length)
  })

  it('only lists completion-capable gateways for complete', () => {
    expect(completionGateways).toContain('featherless')
    expect(completionGateways).toContain('openrouter')
    expect(completionGateways).not.toContain('anthropic')
    expect(completionGateways).not.toContain('gemini')
  })

  it('points featherless at its openai-compatible base url', () => {
    expect(gatewayConfigs.featherless.baseURL).toBe(
      'https://api.featherless.ai/v1'
    )
  })
})
