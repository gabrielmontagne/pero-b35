import path from 'path'
import { combineLatest, map, Observable, of, switchMap } from 'rxjs'
import {
  includePreamble,
  parseSession,
  rebuildLeadingTrailing,
  recombineWithOriginal,
  startEndSplit,
} from './restructure'
import { scanSession } from './scan'
import { readToolsConfig$ } from './tools'

const gateways = {
  ollama: {
    baseURL: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    audioFormat: 'openai' as const,
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY as string,
    audioFormat: 'openai' as const,
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY as string,
    audioFormat: 'gemini' as const,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY as string,
    baseURL: 'https://api.anthropic.com/v1/',
    audioFormat: 'openai' as const,
  },
  openai: {
    audioFormat: 'openai' as const,
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/beta',
    apiKey: process.env.DEEPSEEK_API_KEY as string,
    audioFormat: 'openai' as const,
  },
}

export interface ChatRunOptions {
  model: string
  gateway: keyof typeof gateways
  tools: string[]
  preamble: string[]
  omitTools: boolean
  outputOnly: boolean
  includeReasoning: boolean
  includeTool: 'none' | 'call' | 'result'
  toolsPlacement: 'top' | 'bottom'
}

export function resolveAutoToolsPath(cwd: string, defaultPath: string): string | null {
  const cwdYaml = path.resolve(cwd, 'tools.yaml')
  const cwdYml = path.resolve(cwd, 'tools.yml')

  try {
    const { existsSync } = require('fs') as typeof import('fs')
    if (existsSync(cwdYaml)) return cwdYaml
    else if (existsSync(cwdYml)) return cwdYml
    else if (existsSync(defaultPath)) return defaultPath
  } catch (e) {
    return defaultPath
  }
  return null
}

export function runChat$(text: string, options: ChatRunOptions): Observable<string> {
  const {
    model,
    gateway,
    tools,
    preamble,
    omitTools,
    outputOnly,
    includeReasoning,
    includeTool,
    toolsPlacement,
  } = options

  const defaultToolsPath = path.join(__dirname, '..', '..', 'tools.yaml')
  const autoToolsPath = resolveAutoToolsPath(process.cwd(), defaultToolsPath)
  
  const finalToolPaths = [
    ...(omitTools || !autoToolsPath ? [] : [autoToolsPath]),
    ...tools,
  ]

  return combineLatest({
    gatewayConfig: of(gateways[gateway]),
    input: of(text).pipe(map(startEndSplit)),
    tools: readToolsConfig$(finalToolPaths),
  }).pipe(
    switchMap(({ input: { main, leading, trailing }, tools, gatewayConfig }) => {
      return of(main).pipe(
        switchMap((original) =>
          of(original).pipe(
            includePreamble(preamble),
            parseSession(gatewayConfig),
            scanSession({
              tools,
              model,
              gatewayConfig,
              includeReasoning,
            }),
            recombineWithOriginal({
              original,
              outputOnly,
              includeReasoning,
              includeTool,
              toolsPlacement,
            }),
            rebuildLeadingTrailing(leading, trailing)
          )
        )
      )
    })
  )
}