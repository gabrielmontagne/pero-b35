import path from "path"
import { combineLatest, map, of, switchMap } from "rxjs"
import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { createInputText$, out } from "./io"
import { flog } from "./log"
import { includePreamble, parseSession, rebuildLeadingTrailing, recombineWithOriginal, startEndSplit } from "./restructure"
import { scanSession } from "./scan"
import { readToolsConfig$ } from "./tools"

interface ChatOptions extends Options {
  file: string,
  model: string,
  tools: string[]
  preamble: string[]
  omitDefaultTools: boolean,
  outputOnly: boolean
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
      default: 'anthropic/claude-3.5-sonnet'
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
    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const { file, model, omitDefaultTools, tools, preamble, outputOnly } = args

    const input$ = createInputText$(file)

    combineLatest(
      {
        input: input$.pipe(map(startEndSplit)),
        tools: readToolsConfig$([...(omitDefaultTools ? [] : [defaultToolsPath]), ...tools])
      }
    )
      .pipe(
        switchMap(
          ({ input: { main, leading, trailing }, tools }) => {
            return of(main).pipe(
              switchMap(content => of(content).pipe(
                includePreamble(preamble),
                parseSession(),
                scanSession(tools, model),
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