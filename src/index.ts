#!/usr/bin/env node

import { config } from 'dotenv'
import { resolve } from 'path'

const envPath = resolve(__dirname, '..', '.env')
config({ path: envPath })

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { chat } from './lib/chat'
import { complete } from './lib/complete'
import { serve } from './lib/serve'

export function main() {
  yargs(hideBin(process.argv))
    .command(chat)
    .command(complete)
    .command(serve)
    .parse()
}

if (require.main === module) {
  main()
}
