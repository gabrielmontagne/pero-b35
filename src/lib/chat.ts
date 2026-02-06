import { switchMap } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { createInputText$, out } from './io'
import { runChat$, ChatRunOptions } from './run-chat'

const gateways = [
  'ollama',
  'openrouter',
  'gemini',
  'anthropic',
  'openai',
  'deepseek',
  'moonshot',
] as const

interface ChatOptions extends Options {
  file: string
  model: string
  tools: string[]
  preamble: string[]
  defaultTools: boolean
  outputOnly: boolean
  gateway: (typeof gateways)[number]
  includeReasoning: boolean
  inlineThink: boolean
  includeTool: string
  toolsPlacement: string
  maxTokens: number
  reasoningEffort: string
}

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
      default: 'anthropic/claude-sonnet-4.5',
    })

    args.option('tools', {
      alias: 't',
      describe: 'tools config file(s)',
      type: 'string',
      array: true,
      default: [],
    })

    args.option('default-tools', {
      boolean: true,
      default: false,
      describe:
        'include auto-discovered tools (local tools.yaml or project default)',
    })

    args.option('gateway', {
      string: true,
      describe: 'gateway provider',
      alias: 'g',
      choices: gateways as any,
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

    args.option('reasoning-effort', {
      string: true,
      alias: 'R',
      choices: ['low', 'medium', 'high'] as any,
      describe: 'reasoning effort for reasoning-capable models',
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

    args.option('max-tokens', {
      number: true,
      describe: 'maximum number of tokens to generate',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const {
      file,
      model,
      gateway,
      defaultTools,
      tools,
      preamble,
      outputOnly,
      includeReasoning,
      includeTool,
      toolsPlacement,
      maxTokens,
      reasoningEffort,
    } = args

    const options: ChatRunOptions = {
      model,
      gateway,
      tools,
      preamble,
      defaultTools,
      outputOnly,
      includeReasoning,
      includeTool: includeTool as any,
      toolsPlacement: toolsPlacement as any,
      maxTokens,
      reasoningEffort: reasoningEffort as any,
    }

    const input$ = createInputText$(file)

    input$.pipe(switchMap((text) => runChat$(text, options))).subscribe(out())
  }
}

export const chat = new ChatCommand()
