import { exec } from 'child_process';
import * as yaml from "js-yaml";
import { ChatCompletion, ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionToolMessageParam } from "openai/resources";
import { MonoTypeOperatorFunction, Observable, combineLatest, forkJoin, map, of, switchMap, throwError } from "rxjs";
import { createInputText$ } from "./io";
import { flog } from "./log";

type ApiTools = ChatCompletionTool[];

type RawTool = {
  description: string;
  parameters?: Record<string, string>;
  command: string;
}

type RawTools = Record<string, RawTool>;

export type ToolsConfig = {
  api: ApiTools;
  commandByName: Record<string, string>

}

type ToolResult = ChatCompletionToolMessageParam;

export function readToolsConfig$(paths: string[]) {
  return combineLatest(
    paths.map(createInputText$)
  ).pipe(
    map(
      yamls => {
        const initial: ToolsConfig = { api: [], commandByName: {} }
        return yamls.reduce(
          (acc, next) => {
            const nextTools = parseToolsConfig(next)
            return {
              api: [...acc.api, ...nextTools.api],
              commandByName: {
                ...acc.commandByName,
                ...nextTools.commandByName
              }
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
  const result: ToolsConfig = { api: [], commandByName: {} }
  return Object.entries(rawTools).reduce(toConfig, result)
}

function toConfig(acc: ToolsConfig, [name, tool]: [string, RawTool]) {

  const { description, parameters={}, command } = tool;

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
    api: [...acc.api, apiTool],
    commandByName: {
      ...acc.commandByName,
      [name]: command
    }
  }
}

export function runToolsIfNeeded(commandByName: Record<string, string>): MonoTypeOperatorFunction<ChatCompletion> {
  return source$ => source$.pipe(
    switchMap(
      response => {
        const firstChoice = response.choices[0]
        const reason = firstChoice.finish_reason

        if (reason === 'tool_calls') {
          const toolCalls = firstChoice.message.tool_calls

          if (!toolCalls) return of(response)
          const runCommands = toolCalls.map(
            (toolCall) => {
              const { id, function: fn } = toolCall
              const { name, arguments: args } = fn
              const command = commandByName[name]
              return runCommand$(command, JSON.parse(args), id)
            },
          )

          return forkJoin(runCommands).pipe(switchMap((results) => {
            const toolResults = [firstChoice.message, ...results]
            return throwError(() => new RerunWithToolResults(toolResults))
          }))
        }

        return of(response)
      }
    ),

  )
}

function runCommand$(commandTemplate: string, args: Record<string, string>, id: string): Observable<ToolResult> {

  const command = formatCommand(commandTemplate, args)
  return new Observable<ToolResult>(o => {
    exec(
      command,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          o.error(stderr);
        }

        const result: ToolResult = {
          tool_call_id: id,
          content: stdout,
          role: 'tool'
        }
        o.next(result);
        o.complete();
      }
    )
  }).pipe(flog(`Run commnd »${command}«`))
}

export function formatCommand(commandTemplate: string, parameters: { [key: string]: string }): string {
  return commandTemplate.replace(/{{(\w+)}}/g, (_, key) => {
    if (!parameters[key]) {
      throw new Error(`Missing parameter ${key} in command ${commandTemplate}`)
    }
    return parameters[key]
  }
  );
}

export class RerunWithToolResults extends Error {
  toolsMessages: ChatCompletionMessageParam[]
  constructor(toolsMessages: ChatCompletionMessageParam[]) {
    super()
    this.toolsMessages = toolsMessages;
  }
}