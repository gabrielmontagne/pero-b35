import { map } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { createInputText$, out } from './io'
import { jsonlToFlat } from './session-codec'

interface ImportOptions extends Options {
  file: string
}

class ImportCommand<U extends ImportOptions> implements CommandModule<{}, U> {
  command = 'import'
  describe = 'Import a pi session JSONL as a flat chat.'

  builder(args: Argv): Argv<U> {
    args.option('file', {
      string: true,
      alias: 'f',
      describe: 'file to read from - defaults to stdin',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const { file } = args

    createInputText$(file)
      .pipe(map((text) => jsonlToFlat(text)))
      .subscribe(out())
  }
}

export const importCmd = new ImportCommand()
