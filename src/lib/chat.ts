import path from "path"
import { combineLatest, map, of, switchMap } from "rxjs"
import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { createInputText$, out } from "./io"
import { flog } from "./log"
import {
  includePreamble, parseSession, rebuildLeadingTrailing, recombineWithOriginal, startEndSplit
} from "./restructure"
import { scanSession } from "./scan"
import { readToolsConfig$ } from "./tools"

const gateways = {
  'ollama': {
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama'
  },
  'openrouter': {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY as string,
  },
  'gemini': {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY as string,
  }
}

interface ChatOptions extends Options {
  file: string,
  model: string,
  tools: string[]
  preamble: string[]
  omitDefaultTools: boolean,
  outputOnly: boolean,
  gateway: keyof typeof gateways,
  includeReasoning: boolean
}

const defaultToolsPath = path.join(__dirname, '..', '..', 'tools.yaml')

class ChatCommand<U extends ChatOptions> implements CommandModule<{}, U> {
  command = 'chat'
  describe = 'Run a chat.'
  builder(args: Argv): Argv<U> {
    args.option('file', { string: true, alias: 'f', describe: 'file to read from - defaults to stdin' })

    args.option('model', {
      alias: 'm',
      describe: 'model to use',
      type: 'string',
      default: 'openai/gpt-4o'
    })

    args.option('tools', {
      alias: 't',
      describe: 'tools config file(s)',
      type: 'string',
      array: true,
      default: []
    })

    args.option(
      'omit-default-tools',
      {
        boolean: true,
        default: false,
        describe: 'do not include the default tools'
      }
    )

    args.option(
      'gateway',
      {
        string: true,
        describe: 'gateway provider',
        alias: 'g',
        choices: Object.keys(gateways),
        default: 'openrouter'
      }
    )

    args.option(
      'preamble',
      {
        string: true,
        alias: 'p',
        describe: 'optional additional "offline" files to be prepended to the prompt',
        array: true,
        default: []
      }
    )

    args.option(
      'output-only',
      {
        boolean: true,
        default: false,
        alias: 'o',
        describe: 'output only, do not return the chat'
      }
    )

    args.option(
      'include-reasoning',
      {
        boolean: true,
        default: false,
        alias: 'r',
        describe: 'include reasoning in the output'
      }
    )

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const { file, model, gateway, omitDefaultTools, tools, preamble, outputOnly, includeReasoning
    } = args


    const input$ = createInputText$(file)

    combineLatest(
      {
        gatewayConfig: of(gateways[gateway]),
        input: input$.pipe(map(startEndSplit)),
        tools: readToolsConfig$([...(omitDefaultTools ? [] : [defaultToolsPath]), ...tools])
      }
    )
      .pipe(
        flog('Chat'),
        switchMap(
          ({ input: { main, leading, trailing }, tools,
            gatewayConfig }) => {
            return of(main).pipe(
              switchMap(content => of(content).pipe(
                includePreamble(preamble),
                parseSession(),
                scanSession({ tools, model, gatewayConfig, includeReasoning }),
                recombineWithOriginal(content, outputOnly),
                rebuildLeadingTrailing(leading, trailing),
                flog('Chat'),
              ))
            )
          }
        ),
      ).subscribe(out())
  }
}

export const chat = new ChatCommand()