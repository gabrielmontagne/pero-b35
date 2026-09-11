import { switchMap } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { completionGateways } from './gateways'
import { createInputText$, out } from './io'
import { CompleteRunOptions, runComplete$ } from './run-complete'

interface CompleteOptions extends Options {
  file: string
  model: string
  preamble: string[]
  outputOnly: boolean
  gateway: string
  maxTokens: number
  temperature: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stop: string[]
  n: number
  seed: number
}

class CompleteCommand<U extends CompleteOptions>
  implements CommandModule<{}, U>
{
  command = 'complete'
  describe = 'Raw text completion - no chat, no roles, just continuation.'
  builder(args: Argv): Argv<U> {
    args.option('file', {
      string: true,
      alias: 'f',
      describe: 'file to read from - defaults to stdin',
    })

    args.option('model', {
      alias: 'm',
      describe: 'base model to use',
      type: 'string',
      default: 'mistralai/Mistral-Small-24B-Base-2501',
    })

    args.option('gateway', {
      string: true,
      describe: 'gateway provider (must expose /v1/completions)',
      alias: 'g',
      choices: completionGateways as any,
      default: 'featherless',
    })

    args.option('preamble', {
      string: true,
      alias: 'p',
      describe: 'optional files prepended to the prompt',
      array: true,
      default: [],
    })

    args.option('output-only', {
      boolean: true,
      default: false,
      alias: 'o',
      describe: 'output only the continuation, not prompt + continuation',
    })

    args.option('max-tokens', {
      number: true,
      default: 512,
      describe: 'maximum number of tokens to generate',
    })

    args.option('temperature', {
      number: true,
      alias: 'T',
      default: 1,
      describe: 'sampling temperature',
    })

    args.option('top-p', {
      number: true,
      describe: 'nucleus sampling cutoff',
    })

    args.option('frequency-penalty', {
      number: true,
      describe: 'frequency penalty',
    })

    args.option('presence-penalty', {
      number: true,
      describe: 'presence penalty',
    })

    args.option('stop', {
      string: true,
      array: true,
      describe: 'stop sequence(s)',
      default: [],
    })

    args.option('n', {
      number: true,
      describe: 'number of completions to sample',
    })

    args.option('seed', {
      number: true,
      describe: 'sampling seed, for reproducible runs',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const {
      file,
      model,
      gateway,
      preamble,
      outputOnly,
      maxTokens,
      temperature,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
      n,
      seed,
    } = args

    const options: CompleteRunOptions = {
      model,
      gateway: gateway as any,
      preamble,
      outputOnly,
      maxTokens,
      temperature,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
      n,
      seed,
    }

    const input$ = createInputText$(file)

    input$
      .pipe(switchMap((text) => runComplete$(text, options)))
      .subscribe(out())
  }
}

export const complete = new CompleteCommand()
