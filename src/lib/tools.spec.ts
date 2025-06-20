import { formatCommand, parseToolsConfig } from './tools'
import { describe, expect, it } from 'vitest'

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

  it('should index tool commands by name', () => {
    const tools = parseToolsConfig(config)
    expect(tools.commandByName).toEqual({
      read_file: { command: 'cat {file_path}', stdin_param: undefined },
      read_web_page: { command: 'elinks {url}', stdin_param: undefined },
      search_web: { command: 'googler --np {query}', stdin_param: undefined },
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
