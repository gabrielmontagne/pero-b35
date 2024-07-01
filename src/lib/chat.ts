import OpenAI from "openai"
import { from } from "rxjs"
import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { flog, log } from "./log"
import { parseMessages } from "./parse"
import { out } from "./out"

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
    const contentStream = file ?
      require("fs").createReadStream(file) : process.stdin;

    let content = "";
    contentStream.on("data", (chunk: object) => {
      content += chunk.toString();
    });

    contentStream.on("end", () => {
      const messages = parseMessages(content);
      const openai = new OpenAI()

      from(
        openai.chat.completions.create(
          {
            model: 'gpt-4o',
            messages,
          }
        )
      )
      .pipe(
        flog('Through chat')
      )
      .subscribe(out())
      console.log('done')

    });
  }
}

export const chat = new ChatCommand()