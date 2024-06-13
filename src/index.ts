#!/usr/bin/env node

import { parseConversation } from "./parse";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { resolve } from "path";
import { config } from "dotenv";
import OpenAI from "openai";

console.log(__dirname)
const envPath = resolve(__dirname, '..', '.env');
config({ path: envPath });

export function main() {
  console.log(
    yargs(hideBin(process.argv))
      .command(
        "chat",
        "chat endpoints",
        {
          file: {
            description: "file to read from",
            type: "string",
            alias: "f",
          }
        },
        args => {
          const { file } = args;
          const contentStream = file ? require("fs").createReadStream(file) : process.stdin;

          let content = "";
          contentStream.on("data", (chunk: object) => {
            content += chunk.toString();
          });

          contentStream.on("end", () => {
            console.log("content", content);
            const conversation = parseConversation(content);
            console.log("conversation", conversation);
            const openai = new OpenAI()
            console.log("openai", openai)

            openai.chat.completions.create(
              {
                model: 'gpt-4o',
                messages: [
                  { role: 'user', content: conversation }
                ]
              }
            ).then(
              res => console.log(res.choices[0].message.content)
            )

          });
        }
      ).parse()
  );

}

if (require.main === module) {
  main();
}
