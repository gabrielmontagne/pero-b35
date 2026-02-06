import http from 'node:http'
import { URL } from 'node:url'
import { catchError, throwError } from 'rxjs'
import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { runChat$, ChatRunOptions } from './run-chat'

const gateways = [
  'ollama',
  'openrouter',
  'gemini',
  'anthropic',
  'openai',
  'deepseek',
  'moonshot',
] as const

interface ServeOptions extends Options {
  host: string
  port: number
  model: string
  tools: string[]
  preamble: string[]
  defaultTools: boolean
  outputOnly: boolean
  gateway: (typeof gateways)[number]
  includeReasoning: boolean
  includeTool: string
  toolsPlacement: string
}

function parseQueryParams(url: string): Partial<ChatRunOptions> {
  const parsedUrl = new URL(url, 'http://localhost')
  const params = parsedUrl.searchParams

  const options: Partial<ChatRunOptions> = {}

  if (params.has('model')) options.model = params.get('model')!
  if (params.has('gateway')) options.gateway = params.get('gateway') as any
  if (params.has('output-only'))
    options.outputOnly = params.get('output-only') === 'true'
  if (params.has('include-reasoning'))
    options.includeReasoning = params.get('include-reasoning') === 'true'
  if (params.has('reasoning-effort'))
    options.reasoningEffort = params.get('reasoning-effort') as any
  if (params.has('include-tool'))
    options.includeTool = params.get('include-tool') as any
  if (params.has('tools-placement'))
    options.toolsPlacement = params.get('tools-placement') as any
  if (params.has('default-tools'))
    options.defaultTools = params.get('default-tools') === 'true'
  if (params.has('temperature'))
    options.temperature = parseFloat(params.get('temperature')!)

  const tools = params.getAll('tools').filter(Boolean)
  if (tools.length > 0) options.tools = tools

  const preamble = params.getAll('preamble').filter(Boolean)
  if (preamble.length > 0) options.preamble = preamble

  return options
}

class ServeCommand<U extends ServeOptions> implements CommandModule<{}, U> {
  command = 'serve'
  describe = 'Start HTTP server for text-in/text-out chat processing.'

  builder(args: Argv): Argv<U> {
    args.option('host', {
      string: true,
      alias: 'H',
      describe: 'host to bind to',
      default: '127.0.0.1',
    })

    args.option('port', {
      number: true,
      alias: 'P',
      describe: 'port to bind to',
      default: 3535,
    })

    args.option('model', {
      alias: 'm',
      describe: 'default model to use',
      type: 'string',
      default: 'anthropic/claude-sonnet-4.5',
    })

    args.option('tools', {
      alias: 't',
      describe: 'default tools config file(s)',
      type: 'string',
      array: true,
      default: [],
    })

    args.option('default-tools', {
      boolean: true,
      default: false,
      describe: 'include auto-discovered tools (local or default)',
    })

    args.option('gateway', {
      string: true,
      describe: 'default gateway provider',
      alias: 'g',
      choices: gateways as any,
      default: 'openrouter',
    })

    args.option('preamble', {
      string: true,
      alias: 'p',
      describe:
        'default additional "offline" files to be prepended to the prompt',
      array: true,
      default: [],
    })

    args.option('output-only', {
      boolean: true,
      default: false,
      alias: 'o',
      describe: 'default output only, do not return the chat',
    })

    args.option('include-reasoning', {
      boolean: true,
      default: false,
      alias: 'r',
      describe:
        'default include reasoning @@.think / @@ tags in the output, if present',
    })

    args.option('include-tool', {
      string: true,
      default: 'none',
      choices: ['none', 'call', 'result'],
      describe: 'default include @@.tools block with tool calls/results',
    })

    args.option('tools-placement', {
      string: true,
      default: 'top',
      choices: ['top', 'bottom'],
      describe:
        'default where to place the @@.tools block within the assistant output',
    })

    return args as Argv<U>
  }

  handler(args: ArgumentsCamelCase<U>) {
    const {
      host,
      port,
      model,
      gateway,
      tools,
      preamble,
      defaultTools,
      outputOnly,
      includeReasoning,
      includeTool,
      toolsPlacement,
    } = args

    const defaults: ChatRunOptions = {
      model,
      gateway,
      tools,
      preamble,
      defaultTools,
      outputOnly,
      includeReasoning,
      includeTool: includeTool as any,
      toolsPlacement: toolsPlacement as any,
    }

    const server = http.createServer((req, res) => {
      // Handle CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(200)
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain' })
        res.end('Method Not Allowed')
        return
      }

      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })

      req.on('end', () => {
        try {
          if (!body.trim()) {
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('Empty request body')
            return
          }

          const queryOverrides = parseQueryParams(req.url || '')
          const options: ChatRunOptions = { ...defaults, ...queryOverrides }

          runChat$(body, options)
            .pipe(
              catchError((err) => {
                console.error('Chat processing error:', err)
                const statusCode = 400 // Most processing errors are client-side (missing files, etc.)
                const message = err.message || 'Processing error'
                return throwError(() => ({ statusCode, message }))
              })
            )
            .subscribe({
              next: (result) => {
                res.writeHead(200, {
                  'Content-Type': 'text/plain; charset=utf-8',
                })
                res.end(result)
              },
              error: (err) => {
                const statusCode = err.statusCode || 500
                const message = err.message || 'Internal Server Error'
                console.error('Request failed:', {
                  statusCode,
                  message,
                  originalError: err,
                })
                res.writeHead(statusCode, { 'Content-Type': 'text/plain' })
                res.end(message)
              },
            })
        } catch (err) {
          console.error('Request processing error:', err)
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Internal Server Error')
        }
      })

      req.on('error', (err) => {
        console.error('Request error:', err)
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Bad Request')
      })
    })

    // Process-level error handlers to prevent server crashes
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception - Server staying alive:', err)
      // Don't exit, keep server running
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection - Server staying alive:', {
        reason,
        promise: promise.toString(),
      })
      // Don't exit, keep server running
    })

    server.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}/`)
    })
  }
}

export const serve = new ServeCommand()
