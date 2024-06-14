// import OpenAI from "openai";
import { ArgumentsCamelCase, Argv, CommandModule, Options } from "yargs"
import { parseConversation } from "./parse"
import OpenAI from "openai"

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
      const conversation = parseConversation(content);
      const openai = new OpenAI()

      openai.chat.completions.create(
        {
          model: 'gpt-4o',
          messages: [
            { role: 'user', content: conversation }
          ]
        }
      ).then(
        res => console.log([conversation, res.choices[0].message.content].join('\nA>>\n\n'))
      )
    });
  }
}

export const chat = new ChatCommand()