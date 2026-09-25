import { map } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { createInputText$, out } from './io'
import { parseFlat, startEndSplit } from './restructure'
import { sessionToJsonl } from './session-codec'

interface ExportOptions extends Options {
  file: string
  model: string
}

class ExportCommand<U extends ExportOptions> implements CommandModule<{}, U> {
  command = 'export'
  describe = 'Export a flat chat to a pi session JSONL.'

  builder(args: Argv): Argv<U> {
    args.option('file', {
      string: true,
      alias: 'f',
      describe: 'file to read from - defaults to stdin',
    })

    args.option('model', {
      alias: 'm',
      describe: 'model name stored on exported assistant messages',
      type: 'string',
      default: 'unknown',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const { file, model } = args

    createInputText$(file)
      .pipe(
        map(startEndSplit),
        map(({ main }) => parseFlat(main)),
        map((session) => sessionToJsonl(session, { cwd: process.cwd(), model }))
      )
      .subscribe(out())
  }
}

export const exportCmd = new ExportCommand()
