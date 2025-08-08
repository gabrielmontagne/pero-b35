import path from 'path'
import { combineLatest, map, of, switchMap } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { createInputText$, out } from './io'
import { flog } from './log'
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
    baseURL: 'http://127.0.0.1:11434/v1', // localhost didn't work on CCXLVIII
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
    apiKey: process.env.ANTHROPIC_API_KEY as string, // Your Anthropic API key
    baseURL: 'https://api.anthropic.com/v1/', // Anthropic API endpoint
    audioFormat: 'openai' as const, // Fallback, Claude doesn't support audio files yet
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

interface ChatOptions extends Options {
  file: string
  model: string
  tools: string[]
  preamble: string[]
  omitDefaultTools: boolean
  omitTools: boolean
  outputOnly: boolean
  gateway: keyof typeof gateways
  includeReasoning: boolean
  inlineThink: boolean
  includeTool: string
  toolsPlacement: string
}
const defaultToolsPath = path.join(__dirname, '..', '..', 'tools.yaml')

class ChatCommand<U extends ChatOptions> implements CommandModule<{}, U> {
  command = 'chat'
  describe = 'Run a chat.'
  builder(args: Argv): Argv<U> {
    args.option('file', {
      string: true,
      alias: 'f',
      describe: 'file to read from - defaults to stdin',
    })

    args.option('model', {
      alias: 'm',
      describe: 'model to use',
      type: 'string',
      default: 'openai/gpt-4o',
    })

    args.option('tools', {
      alias: 't',
      describe: 'tools config file(s)',
      type: 'string',
      array: true,
      default: [],
    })

    args.option('omit-tools', {
      boolean: true,
      default: false,
      describe: 'do not include automatic tools (local or default)',
    })

    args.option('omit-default-tools', {
      boolean: true,
      default: false,
      describe: 'do not include the default tools',
      deprecated: 'use --omit-tools',
    })

    args.option('gateway', {
      string: true,
      describe: 'gateway provider',
      alias: 'g',
      choices: Object.keys(gateways),
      default: 'openrouter',
    })

    args.option('preamble', {
      string: true,
      alias: 'p',
      describe:
        'optional additional "offline" files to be prepended to the prompt',
      array: true,
      default: [],
    })

    args.option('output-only', {
      boolean: true,
      default: false,
      alias: 'o',
      describe: 'output only, do not return the chat',
    })

    args.option('include-reasoning', {
      boolean: true,
      default: false,
      alias: 'r',
      describe:
        'include reasoning @@.think / @@ tags in the output, if present',
    })

    args.option('include-tool', {
      string: true,
      default: 'none',
      choices: ['none', 'call', 'result'],
      describe: 'include @@.tools block with tool calls/results',
    })

    args.option('tools-placement', {
      string: true,
      default: 'top',
      choices: ['top', 'bottom'],
      describe: 'where to place the @@.tools block within the assistant output',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const {
      file,
      model,
      gateway,
      // keep receiving omitDefaultTools for backwards-compat
      omitDefaultTools,
      tools,
      preamble,
      outputOnly,
      includeReasoning,
      includeTool,
      toolsPlacement,
    } = args

    const omitTools = (args as any).omitTools ?? omitDefaultTools ?? false

    const cwdYaml = path.resolve(process.cwd(), 'tools.yaml')
    const cwdYml = path.resolve(process.cwd(), 'tools.yml')

    let autoToolsPath: string | null = null
    try {
      const { existsSync } = require('fs') as typeof import('fs')
      if (existsSync(cwdYaml)) autoToolsPath = cwdYaml
      else if (existsSync(cwdYml)) autoToolsPath = cwdYml
      else if (existsSync(defaultToolsPath)) autoToolsPath = defaultToolsPath
    } catch (e) {
      // if fs is unavailable for some reason, fall back to default
      autoToolsPath = defaultToolsPath
    }

    const finalToolPaths = [
      ...(omitTools || !autoToolsPath ? [] : [autoToolsPath]),
      ...tools,
    ]

    const input$ = createInputText$(file)

    combineLatest({
      gatewayConfig: of(gateways[gateway]),
      input: input$.pipe(map(startEndSplit)),
      tools: readToolsConfig$(finalToolPaths),
    })
      .pipe(
        flog('Chat'),
        switchMap(
          ({ input: { main, leading, trailing }, tools, gatewayConfig }) => {
            return of(main).pipe(
              switchMap((original) =>
                of(original).pipe(
                  includePreamble(preamble),
                  parseSession(gatewayConfig),
                  flog('Session'),
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
                    includeTool: includeTool as any,
                    toolsPlacement: toolsPlacement as any,
                  }),
                  rebuildLeadingTrailing(leading, trailing),
                  flog('Chat')
                )
              )
            )
          }
        )
      )
      .subscribe(out())
  }
}

export const chat = new ChatCommand()
