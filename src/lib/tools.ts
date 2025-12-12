import { exec } from 'child_process'
import * as yaml from 'js-yaml'
import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources'
import {
  MonoTypeOperatorFunction,
  Observable,
  combineLatest,
  forkJoin,
  map,
  of,
  switchMap,
  throwError,
  timeout,
  TimeoutError,
  catchError,
} from 'rxjs'
import { createInputText$ } from './io'
import { flog } from './log'
import {
  McpClients,
  McpServersConfig,
  McpToolEntry,
  connectMcpServers$,
  callMcpTool$,
} from './mcp'

type ApiTools = ChatCompletionTool[]

type RawTool = {
  description: string
  parameters?: Record<string, string>
  command: string
  stdin_param?: string
  enabled?: boolean
  timeout?: number
}

// Executor types for unified dispatch
export type BashToolEntry = {
  type: 'bash'
  command: string
  stdin_param?: string
  timeout?: number
}

export type ToolExecutor = BashToolEntry | McpToolEntry

export type ToolsConfig = {
  api: ApiTools
  executors: Record<string, ToolExecutor>
  mcpClients: McpClients
}

type ToolResult = ChatCompletionToolMessageParam

const MCP_SERVERS_KEY = '_mcp_servers'

type ParsedConfig = {
  api: ApiTools
  executors: Record<string, ToolExecutor>
  mcpServers: McpServersConfig
}

export function readToolsConfig$(
  paths: string[]
): Observable<ToolsConfig | null> {
  if (!paths.length) return of(null)

  return combineLatest(paths.map(createInputText$)).pipe(
    map((yamls) => {
      const initial: ParsedConfig = { api: [], executors: {}, mcpServers: {} }
      return yamls.reduce((acc, next) => {
        const nextTools = parseToolsConfig(next)
        return {
          api: [...acc.api, ...nextTools.api],
          executors: { ...acc.executors, ...nextTools.executors },
          mcpServers: { ...acc.mcpServers, ...nextTools.mcpServers },
        }
      }, initial)
    }),
    switchMap((parsed) => {
      // If no MCP servers, return config without connecting
      if (Object.keys(parsed.mcpServers).length === 0) {
        return of({
          api: parsed.api,
          executors: parsed.executors,
          mcpClients: new Map() as McpClients,
        })
      }

      // Connect to MCP servers and merge their tools
      return connectMcpServers$(parsed.mcpServers).pipe(
        map((mcpResult) => ({
          api: [...parsed.api, ...mcpResult.api],
          executors: { ...parsed.executors, ...mcpResult.executors },
          mcpClients: mcpResult.clients,
        }))
      )
    })
  )
}

export function parseToolsConfig(config: string): ParsedConfig {
  const raw = yaml.load(config) as Record<string, unknown>
  const result: ParsedConfig = { api: [], executors: {}, mcpServers: {} }

  for (const [name, value] of Object.entries(raw)) {
    if (name === MCP_SERVERS_KEY) {
      // Filter out disabled MCP servers
      const servers = value as McpServersConfig
      for (const [serverName, serverConfig] of Object.entries(servers)) {
        if (serverConfig.enabled !== false) {
          result.mcpServers[serverName] = serverConfig
        }
      }
    } else {
      const tool = value as RawTool
      // Skip disabled tools
      if (tool.enabled === false) continue

      const {
        description,
        parameters = {},
        command,
        stdin_param,
        timeout,
      } = tool

      const properties = Object.entries(parameters).reduce(
        (acc, [key, val]) => ({
          ...acc,
          [key]: { type: 'string', description: val },
        }),
        {}
      )

      const apiTool: ChatCompletionTool = {
        function: {
          name,
          description,
          parameters: {
            type: 'object',
            properties,
            required: Object.keys(parameters),
          },
        },
        type: 'function',
      }

      result.api.push(apiTool)
      result.executors[name] = { type: 'bash', command, stdin_param, timeout }
    }
  }

  return result
}

export function runToolsIfNeeded(
  executors?: Record<string, ToolExecutor>,
  mcpClients?: McpClients
): MonoTypeOperatorFunction<ChatCompletion> {
  if (!executors) return (source$) => source$
  return (source$) =>
    source$.pipe(
      switchMap((response) => {
        const { choices } = response
        if (!choices) {
          console.error('No choices in response', response)
        }
        const firstChoice = choices[0]
        const reason = firstChoice.finish_reason

        if (reason === 'tool_calls') {
          const toolCalls = firstChoice.message.tool_calls

          if (!toolCalls) return of(response)

          toolCalls.forEach((call) => {
            if (!call.id) {
              call.id = `pero-gen-${Math.random().toString(36).substring(2, 9)}`
            }
          })

          const runCommands = toolCalls.map((toolCall) => {
            const { id, function: fn } = toolCall
            const { name, arguments: args } = fn
            const executor = executors[name]
            const parsedArgs = JSON.parse(args)

            if (executor.type === 'bash') {
              return runBashCommand$(executor, parsedArgs, id)
            } else {
              return runMcpTool$(mcpClients!, executor, parsedArgs, id)
            }
          })

          return forkJoin(runCommands).pipe(
            switchMap((results) => {
              const toolResults = [firstChoice.message, ...results]
              return throwError(() => new RerunWithToolResults(toolResults))
            })
          )
        }

        return of(response)
      })
    )
}

function runMcpTool$(
  clients: McpClients,
  executor: McpToolEntry,
  args: Record<string, unknown>,
  id: string
): Observable<ToolResult> {
  const { serverName, toolName, timeout: timeoutMs } = executor

  // Default MCP timeout: 5 minutes (300000ms)
  const effectiveTimeout = timeoutMs ?? 300000

  const execution$ = callMcpTool$(
    clients,
    serverName,
    toolName,
    args,
    effectiveTimeout
  ).pipe(
    map((content) => ({
      tool_call_id: id,
      content,
      role: 'tool' as const,
    }))
  )

  return execution$.pipe(
    timeout({
      each: effectiveTimeout,
      with: () =>
        throwError(
          () =>
            new Error(
              `MCP tool ${serverName}/${toolName} timed out after ${effectiveTimeout}ms`
            )
        ),
    }),
    catchError((err) => {
      if (err instanceof TimeoutError) {
        // Timeout already triggered abort via teardown
        return of({
          tool_call_id: id,
          content: `MCP tool execution timed out after ${effectiveTimeout}ms`,
          role: 'tool' as const,
        })
      }
      throw err
    }),
    flog(`Run MCP tool »${serverName}/${toolName}«`)
  )
}

function runBashCommand$(
  toolConfig: BashToolEntry,
  args: Record<string, string>,
  id: string
): Observable<ToolResult> {
  const {
    command: commandTemplate,
    stdin_param,
    timeout: timeoutMs,
  } = toolConfig

  let stdinContent: string | undefined
  const commandArgs = { ...args }

  if (stdin_param && commandArgs[stdin_param] !== undefined) {
    stdinContent = String(commandArgs[stdin_param])
    delete commandArgs[stdin_param]
  }

  const command = formatCommand(commandTemplate, commandArgs)

  const execution$ = new Observable<ToolResult>((o) => {
    const abortController = new AbortController()

    const child = exec(
      command,
      { signal: abortController.signal },
      (error, stdout, stderr) => {
        if (error) {
          // Check if it was aborted by timeout
          if (error.signal === 'SIGTERM' || abortController.signal.aborted) {
            const content = `Tool execution timed out and was killed.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
            console.error(`timeout for command "${command}"`)
            o.next({
              tool_call_id: id,
              content: content,
              role: 'tool',
            })
            o.complete()
            return
          }

          const content = `Tool execution failed with exit code ${error.code}.\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`
          console.error(`exec error for command "${command}":\n${content}`)
          o.next({
            tool_call_id: id,
            content: content,
            role: 'tool',
          })
          o.complete()
          return
        }

        const result: ToolResult = {
          tool_call_id: id,
          content: stdout,
          role: 'tool',
        }

        o.next(result)
        o.complete()
      }
    )

    if (stdinContent && child.stdin) {
      // Handle stdin errors
      child.stdin.on('error', (err) => {
        console.error(`stdin error for command "${command}": ${err.message}`)
        // Don't emit an error to the observable, just log it
        // The exec callback will handle the overall result
      })

      // Write with a callback to ensure proper error handling
      child.stdin.write(stdinContent, (err) => {
        if (err) {
          console.error(
            `Error writing to stdin for command "${command}": ${err.message}`
          )
        }
        // Always try to end the stream, even if write failed
        try {
          if (child.stdin) {
            child.stdin.end()
          }
        } catch (endErr) {
          console.error(
            `Error ending stdin for command "${command}": ${endErr}`
          )
        }
      })
    }

    // Teardown: abort and kill child process if Observable is unsubscribed
    return () => {
      if (child.exitCode === null && !child.killed) {
        abortController.abort()
        child.kill('SIGTERM')
      }
    }
  })

  // Apply timeout if configured
  if (timeoutMs && timeoutMs > 0) {
    return execution$.pipe(
      timeout({
        each: timeoutMs,
        with: () =>
          throwError(
            () => new Error(`Bash tool timed out after ${timeoutMs}ms`)
          ),
      }),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          // Timeout already triggered cleanup via teardown
          return of({
            tool_call_id: id,
            content: `Tool execution timed out after ${timeoutMs}ms`,
            role: 'tool' as const,
          })
        }
        throw err
      }),
      flog(`Run command »${command}«`)
    )
  }

  return execution$.pipe(flog(`Run command »${command}«`))
}

export function formatCommand(
  commandTemplate: string,
  parameters: { [key: string]: string }
): string {
  return commandTemplate.replace(/{{(\w+)}}/g, (_, key) => {
    if (!parameters[key]) {
      throw new Error(`Missing parameter ${key} in command ${commandTemplate}`)
    }
    return parameters[key]
  })
}

export class RerunWithToolResults extends Error {
  toolsMessages: ChatCompletionMessageParam[]
  constructor(toolsMessages: ChatCompletionMessageParam[]) {
    super()
    this.toolsMessages = toolsMessages
  }
}
