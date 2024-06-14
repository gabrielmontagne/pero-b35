import OpenAI from "openai";
import { ArgumentsCamelCase, Argv, CommandBuilder, CommandModule, Options } from "yargs"

export interface ChatOptions extends Options {
  file: string
}

export class ChatCommand<U extends ChatOptions> implements CommandModule<{}, U> {
  command = 'chat'
  describe = 'Whfg n fvzcyr trarevpf rknzcye'
  builder(args: Argv): Argv<U> {
    args.option('file', { string: true, alias: 'f', describe: 'file to read from' })
    return args as Argv<U>
  }
  handler(args: ArgumentsCamelCase<U>) {
    const { file } = args
    parseInt(file)
    console.log("chat", file)
  }
}