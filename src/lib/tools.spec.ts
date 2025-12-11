import { formatCommand, parseToolsConfig } from './tools'
import { describe, expect, it } from 'vitest'

describe('MCP config parsing', () => {
  const configWithMcp = `
read_file:
  description: Read the contents of a file
  parameters:
    file_path: The path to the file to read
  command: "cat {{file_path}}"

_mcp_servers:
  time:
    command: uvx
    args:
      - mcp-server-time
      - --local-timezone=Europe/Warsaw
  memory:
    command: npx
    args:
      - -y
      - "@modelcontextprotocol/server-memory"
`

  it('should separate bash tools from MCP server configs', () => {
    const result = parseToolsConfig(configWithMcp)

    // Should have one bash tool
    expect(result.api).toHaveLength(1)
    expect(result.api[0].function.name).toBe('read_file')

    // Should have one bash executor
    expect(result.executors).toEqual({
      read_file: {
        type: 'bash',
        command: 'cat {{file_path}}',
        stdin_param: undefined,
      },
    })

    // Should have two MCP servers
    expect(result.mcpServers).toEqual({
      time: {
        command: 'uvx',
        args: ['mcp-server-time', '--local-timezone=Europe/Warsaw'],
      },
      memory: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
      },
    })
  })
})

describe('enabled flag', () => {
  it('should skip disabled bash tools', () => {
    const config = `
active_tool:
  description: An active tool
  command: echo "active"

disabled_tool:
  enabled: false
  description: A disabled tool
  command: echo "disabled"
`
    const result = parseToolsConfig(config)
    expect(result.api).toHaveLength(1)
    expect(result.api[0].function.name).toBe('active_tool')
    expect(result.executors).toHaveProperty('active_tool')
    expect(result.executors).not.toHaveProperty('disabled_tool')
  })

  it('should skip disabled MCP servers', () => {
    const config = `
_mcp_servers:
  active_server:
    command: uvx
    args: [mcp-server-time]
  disabled_server:
    enabled: false
    command: npx
    args: [-y, some-server]
`
    const result = parseToolsConfig(config)
    expect(result.mcpServers).toHaveProperty('active_server')
    expect(result.mcpServers).not.toHaveProperty('disabled_server')
  })
})

describe('tools config', () => {
  const config = `

read_file:
  description: Read the contents of a file
  parameters:
    file_path: The path to the file to read
  command: "cat {file_path}"

read_web_page:
  description: Read the contents of a web page
  parameters:
    url: The URL of the web page to read
  command: "elinks {url}"

search_web:
  description: Search the web for a given query
  parameters:
    query: "The search query"
  command: "googler --np {query}"
`

  it('should unpack a YAML tools config into an OpenAI tools config', () => {
    expect(parseToolsConfig(config).api).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a file',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'The path to the file to read',
              },
            },
            required: ['file_path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'read_web_page',
          description: 'Read the contents of a web page',
          parameters: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL of the web page to read',
              },
            },
            required: ['url'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for a given query',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
            },
            required: ['query'],
          },
        },
      },
    ])
  })

  it('should index tool executors by name', () => {
    const tools = parseToolsConfig(config)
    expect(tools.executors).toEqual({
      read_file: {
        type: 'bash',
        command: 'cat {file_path}',
        stdin_param: undefined,
      },
      read_web_page: {
        type: 'bash',
        command: 'elinks {url}',
        stdin_param: undefined,
      },
      search_web: {
        type: 'bash',
        command: 'googler --np {query}',
        stdin_param: undefined,
      },
    })
  })
})

describe('command execution', () => {
  it('should format a command with parameters', () => {
    const command = formatCommand('echo {{foo}}', { foo: 'bar' })
    expect(command).toEqual('echo bar')
  })

  it('should format a command with multpleparameters', () => {
    const command = formatCommand('echo {{foo}} {{bar}}', {
      foo: 'bar',
      bar: 'baz',
    })
    expect(command).toEqual('echo bar baz')
  })

  it('should throw an error if a parameter is missing', () => {
    expect(() => formatCommand('echo {{foo}}', { bar: 'baz' })).toThrow(
      'Missing parameter foo in command echo {{foo}}'
    )
  })
})
