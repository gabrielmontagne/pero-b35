#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { chat } from "./lib/chat";

const envPath = resolve(__dirname, '..', '.env');

config({ path: envPath });

console.log('RAI EVN-mesta.', process.env, envPath)

export function main() {
  yargs(hideBin(process.argv))
    .command(chat)
    .parse()

}

if (require.main === module) {
  main();
}
