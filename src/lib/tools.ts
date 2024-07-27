import * as yaml from "js-yaml";
import { ChatCompletionTool } from "openai/resources";
import { combineLatest, map, of } from "rxjs";
import { createInputText$ } from "./io";

type ApiTools = ChatCompletionTool[];

type RawTool = {
  description: string;
  parameters: Record<string, string>;
  command: string;
}

type RawTools = Record<string, RawTool>;

export type ToolsConfig = {
  api: ApiTools;
}

export function readToolsConfig$(paths: string[]) {
  return combineLatest(
    paths.map(createInputText$)
  ).pipe(
    map(
      yamls => {
        const initial: ToolsConfig = { api: [] }
        return yamls.reduce(
          (acc, next) => {
            const nextTools = parseToolsConfig(next)
            return {
              api: [...acc.api, ...nextTools.api]
            }
          },
          initial
        )
      }
    )
  )
}

export function parseToolsConfig(config: string) {

  // TODO validate the config
  const rawTools: RawTools = yaml.load(config) as RawTools;
  const result: ToolsConfig = { api: [] }
  return Object.entries(rawTools).reduce(toConfig, result)
}

function toConfig(acc: ToolsConfig, [name, tool]: [string, RawTool]) {

  const { description, parameters, /* command */ } = tool;

  const properties = Object.entries(parameters).reduce(
    (acc, [key, value]) => ({ ...acc, [key]: { type: "string", description: value } }
    ), {}
  )

  const apiTool: ChatCompletionTool = {
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required: Object.keys(parameters),
      }
    },
    type: "function"
  }

  return {
    ...acc,
    api: [...acc.api, apiTool]
  }
}