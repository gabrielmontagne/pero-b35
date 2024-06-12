#!/usr/bin/env node

import { parseConversation } from "./parse";

export function main() {
    console.log("uryyb JBEYQ!");
    console.log(parseConversation("UV"));
}

if (require.main === module) {
    main();
}
