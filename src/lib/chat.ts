import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { createInputText$, out } from "./io"
import { flog } from "./log"
import { parseSession } from "./parse"
import { scanSession } from "./scan"

interface ChatOptions extends Options {
  file: string
}

class ChatCommand<U extends ChatOptions> implements CommandModule<{}, U> {
  command = 'chat'
  describe = 'Whfg n fvzcyr trarevpf rknzcye'
  builder(args: Argv): Argv<U> {
    args.option('file', { string: true, alias: 'f', describe: 'file to read from' })
    return args as Argv<U>
  }
  handler(args: ArgumentsCamelCase<U>) {
    const { file } = args
    const input$ = createInputText$(file)

    input$.pipe(
      parseSession(),
      flog('Through chat'),
      scanSession()
    ).subscribe(out())
  }
}

export const chat = new ChatCommand()