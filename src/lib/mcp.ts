import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ChatCompletionTool } from 'openai/resources'
import { Observable, from, forkJoin, map, switchMap, of } from 'rxjs'

// Config types (Phase 1: stdio only)
export type McpServerConfig = {
  command: string
  args?: string[]
}

export type McpServersConfig = Record<string, McpServerConfig>

// Runtime types
export type McpClients = Map<string, Client>

export type McpToolEntry = {
  type: 'mcp'
  serverName: string
  toolName: string
}

export type McpToolsResult = {
  api: ChatCompletionTool[]
  executors: Record<string, McpToolEntry>
  clients: McpClients
}

/**
 * Connect to a single MCP server via stdio transport
 */
function connectMcpServer$(
  serverName: string,
  config: McpServerConfig
): Observable<{ client: Client; serverName: string }> {
  return new Observable((observer) => {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    })

    const client = new Client(
      { name: 'pero', version: '0.0.1' },
      { capabilities: {} }
    )

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

/**
 * Fetch tools from a connected MCP client and convert to OpenAI format
 */
function fetchMcpTools$(
  client: Client,
  serverName: string
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
        }
      }

      return { api, executors }
    })
  )
}

/**
 * Connect to all MCP servers defined in config and fetch their tools
 */
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
        fetchMcpTools$(client, serverName)
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

/**
 * Call a tool on an MCP server
 */
export function callMcpTool$(
  clients: McpClients,
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Observable<string> {
  const client = clients.get(serverName)

  if (!client) {
    return new Observable((observer) => {
      observer.error(new Error(`MCP server "${serverName}" not found`))
    })
  }

  return from(client.callTool({ name: toolName, arguments: args })).pipe(
    map((result) => {
      // MCP tool results can have multiple content items
      // For now, concatenate text content
      if (Array.isArray(result.content)) {
        return result.content
          .map((item) => {
            if (item.type === 'text') {
              return item.text
            }
            return JSON.stringify(item)
          })
          .join('\n')
      }
      return JSON.stringify(result)
    })
  )
}

/**
 * Disconnect all MCP servers
 */
export function disconnectMcpServers$(clients: McpClients): Observable<void> {
  if (clients.size === 0) {
    return of(undefined)
  }

  const disconnections$ = Array.from(clients.values()).map((client) =>
    from(client.close())
  )

  return forkJoin(disconnections$).pipe(map(() => undefined))
}
