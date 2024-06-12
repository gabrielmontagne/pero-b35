#!/usr/bin/env node

import { parseConversation } from "./parse";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

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
          });
        }
      ).parse()
  );

}

if (require.main === module) {
  main();
}
