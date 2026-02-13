import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ChatCompletionTool } from 'openai/resources'
import {
  Observable,
  from,
  forkJoin,
  map,
  switchMap,
  of,
  timeout,
  TimeoutError,
} from 'rxjs'

export type McpServerConfig = {
  command: string
  args?: string[]
  enabled?: boolean
  timeout?: number
}

export type McpServersConfig = Record<string, McpServerConfig>

export type McpClients = Map<string, Client>

export type McpToolEntry = {
  type: 'mcp'
  serverName: string
  toolName: string
  timeout?: number
}

export type McpToolsResult = {
  api: ChatCompletionTool[]
  executors: Record<string, McpToolEntry>
  clients: McpClients
}

function connectMcpServer$(
  serverName: string,
  config: McpServerConfig
): Observable<{ client: Client; serverName: string }> {
  return new Observable((observer) => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: process.env as Record<string, string>,
      stderr: 'pipe',
    })

    const client = new Client(
      { name: 'pero', version: '0.0.1' },
      { capabilities: {} }
    )

    const stderrStream = (transport as any).stderr
    if (stderrStream && typeof stderrStream.on === 'function') {
      stderrStream.on('data', () => {})
    }

    client
      .connect(transport)
      .then(() => {
        observer.next({ client, serverName })
        observer.complete()
      })
      .catch((err) => {
        observer.error(
          new Error(
            `Failed to connect to MCP server "${serverName}": ${err.message}`
          )
        )
      })
  })
}

function fetchMcpTools$(
  client: Client,
  serverName: string,
  serverTimeout?: number
): Observable<{
  api: ChatCompletionTool[]
  executors: Record<string, McpToolEntry>
}> {
  return from(client.listTools()).pipe(
    map((response) => {
      const api: ChatCompletionTool[] = []
      const executors: Record<string, McpToolEntry> = {}

      for (const tool of response.tools) {
        const apiTool: ChatCompletionTool = {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        }
        api.push(apiTool)

        executors[tool.name] = {
          type: 'mcp',
          serverName,
          toolName: tool.name,
          timeout: serverTimeout,
        }
      }

      return { api, executors }
    })
  )
}

export function connectMcpServers$(
  serversConfig: McpServersConfig
): Observable<McpToolsResult> {
  const serverNames = Object.keys(serversConfig)

  if (serverNames.length === 0) {
    return of({
      api: [],
      executors: {},
      clients: new Map(),
    })
  }

  const connections$ = serverNames.map((name) =>
    connectMcpServer$(name, serversConfig[name])
  )

  return forkJoin(connections$).pipe(
    switchMap((connections) => {
      const clients: McpClients = new Map()
      connections.forEach(({ client, serverName }) => {
        clients.set(serverName, client)
      })

      const toolFetches$ = connections.map(({ client, serverName }) =>
        fetchMcpTools$(client, serverName, serversConfig[serverName].timeout)
      )

      return forkJoin(toolFetches$).pipe(
        map((toolResults) => {
          const api: ChatCompletionTool[] = []
          const executors: Record<string, McpToolEntry> = {}

          for (const result of toolResults) {
            api.push(...result.api)
            Object.assign(executors, result.executors)
          }

          return { api, executors, clients }
        })
      )
    })
  )
}

export function callMcpTool$(
  clients: McpClients,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  timeout?: number
): Observable<string> {
  const client = clients.get(serverName)

  if (!client) {
    return new Observable((observer) => {
      observer.error(new Error(`MCP server "${serverName}" not found`))
    })
  }

  return new Observable<string>((observer) => {
    const abortController = new AbortController()

    client
      .callTool({ name: toolName, arguments: args }, undefined, {
        signal: abortController.signal,
        timeout: timeout,
      })
      .then((result) => {
        if (Array.isArray(result.content)) {
          const content = result.content
            .map((item) => {
              if (item.type === 'text') {
                return item.text
              }
              return JSON.stringify(item)
            })
            .join('\n')
          observer.next(content)
        } else {
          observer.next(JSON.stringify(result))
        }
        observer.complete()
      })
      .catch((err) => {
        if (abortController.signal.aborted) {
          observer.error(
            new Error(
              `MCP tool ${serverName}/${toolName} timed out and was cancelled`
            )
          )
        } else {
          observer.error(err)
        }
      })

    return () => {
      abortController.abort()
    }
  })
}

export function disconnectMcpServers$(clients: McpClients): Observable<void> {
  if (clients.size === 0) {
    return of(undefined)
  }

  const disconnections$ = Array.from(clients.values()).map((client) =>
    from(client.close())
  )

  return forkJoin(disconnections$).pipe(map(() => undefined))
}
