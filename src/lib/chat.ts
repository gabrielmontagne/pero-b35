import path from "path"
import { combineLatest, map, of, switchMap } from "rxjs"
import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { createInputText$, out } from "./io"
import { flog } from "./log"
import { parseSession, recombineWithOriginal, recombineSession, startEndSplit } from "./restructure"
import { scanSession } from "./scan"
import { readToolsConfig$ } from "./tools"

interface ChatOptions extends Options {
  file: string,
  tools: string[]
}

const defaultToolsPath = path.join(__dirname, '..', '..', 'tools.yaml')

class ChatCommand<U extends ChatOptions> implements CommandModule<{}, U> {
  command = 'chat'
  describe = 'Run a chat.'
  builder(args: Argv): Argv<U> {
    args.option('file', { string: true, alias: 'f', describe: 'file to read from - defaults to stdin' }),
      args.option('tools', {
        alias: 't',
        describe: 'tools config file(s)',
        type: 'string',
        array: true,
        default: [defaultToolsPath]
      })
    args.option(
      'offline-preamble',
      {
        string: true,
        alias: 'p',
        describe: 'optional additional "offline" files to be prepended to the prompt',
        array: true,
        default: []
      }
    )
    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const { file, tools } = args

    const input$ = createInputText$(file)

    combineLatest(
      {
        input: input$.pipe(map(startEndSplit)),
        tools: readToolsConfig$(tools)
      }
    )
      .pipe(
        switchMap(
          ({ input: { main }, tools }) => {
            return of(main).pipe(
              switchMap(content => of(content).pipe(
                flog('Main'),
                parseSession(),
                flog('Through chat'),
                scanSession(tools),
                recombineWithOriginal(content),
                flog('before appending Q>>'),
                map(content => `${content}\n\nQ>>\n\n`),
                flog('after appending Q>>'),
              ))
            )
          }
        ),
      ).subscribe(out())
  }
}

export const chat = new ChatCommand()