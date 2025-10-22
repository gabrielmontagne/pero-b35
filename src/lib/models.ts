import { ArgumentsCamelCase, Argv, CommandModule, Options } from 'yargs'
import { gateways, Gateway } from './gateways'

interface ModelsOptions extends Options {
  gateway: Gateway
}

class ModelsCommand<U extends ModelsOptions> implements CommandModule<{}, U> {
  command = 'models'
  describe = 'List available models for a gateway'

  builder(args: Argv): Argv<U> {
    args.option('gateway', {
      string: true,
      describe: 'gateway provider',
      alias: 'g',
      choices: gateways as any,
      default: 'copilot',
    })
    return args as Argv<U>
  }

  async handler(args: ArgumentsCamelCase<U>) {
    const { gateway } = args

    const configs: Record<Gateway, any> = {
      ollama: {
        baseURL: 'http://127.0.0.1:11434/v1',
        apiKey: 'ollama',
      },
      openrouter: {
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
      },
      gemini: {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: process.env.GEMINI_API_KEY,
      },
      anthropic: {
        baseURL: 'https://api.anthropic.com/v1/',
        apiKey: process.env.ANTHROPIC_API_KEY,
      },
      openai: {
        baseURL: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY,
      },
      deepseek: {
        baseURL: 'https://api.deepseek.com/beta',
        apiKey: process.env.DEEPSEEK_API_KEY,
      },
      copilot: {
        baseURL: 'https://api.githubcopilot.com',
        apiKey: process.env.GITHUB_COPILOT_TOKEN,
        headers: {
          'User-Agent': 'GitHubCopilotChat/0.31.2',
          'Editor-Version': 'vscode/1.104.1',
          'Editor-Plugin-Version': 'copilot-chat/0.31.2',
          'Copilot-Integration-Id': 'vscode-chat',
        },
      },
    }

    const config = configs[gateway]
    if (!config.apiKey) {
      console.error(`Error: API key not found for ${gateway}`)
      process.exit(1)
    }

    try {
      const response = await fetch(`${config.baseURL}/models`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.headers || {}),
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.data && Array.isArray(data.data)) {
        console.log(`\nAvailable models for ${gateway}:\n`)
        data.data.forEach((model: any) => {
          console.log(`  ${model.id}`)
        })
        console.log()
      } else {
        console.log(JSON.stringify(data, null, 2))
      }
    } catch (error) {
      console.error(`Error fetching models: ${error}`)
      process.exit(1)
    }
  }
}

export const models = new ModelsCommand()
