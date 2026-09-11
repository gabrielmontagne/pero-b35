export interface GatewayConfig {
  baseURL?: string
  apiKey?: string
  audioFormat?: 'openai' | 'gemini'
  /** Gateway serves raw /v1/completions (base / non-chat models). */
  completions?: boolean
}

export const gatewayConfigs = {
  ollama: {
    baseURL: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    audioFormat: 'openai' as const,
    completions: true,
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY as string,
    audioFormat: 'openai' as const,
    completions: true,
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKey: process.env.GEMINI_API_KEY as string,
    audioFormat: 'gemini' as const,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY as string,
    baseURL: 'https://api.anthropic.com/v1/',
    audioFormat: 'openai' as const,
  },
  openai: {
    audioFormat: 'openai' as const,
    completions: true,
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/beta',
    apiKey: process.env.DEEPSEEK_API_KEY as string,
    audioFormat: 'openai' as const,
    completions: true,
  },
  moonshot: {
    baseURL: 'https://api.moonshot.ai/v1',
    apiKey: process.env.MOONSHOT_API_KEY as string,
    audioFormat: 'openai' as const,
  },
  minimax: {
    baseURL: 'https://api.minimax.io/v1',
    apiKey: process.env.MINIMAX_API_KEY as string,
    audioFormat: 'openai' as const,
  },
  featherless: {
    baseURL: 'https://api.featherless.ai/v1',
    apiKey: process.env.FEATHERLESS_API_KEY as string,
    audioFormat: 'openai' as const,
    completions: true,
  },
} satisfies Record<string, GatewayConfig>

export type GatewayName = keyof typeof gatewayConfigs

export const gateways = Object.keys(gatewayConfigs) as GatewayName[]

/** Gateways that expose a raw text-completion endpoint. */
export const completionGateways = gateways.filter(
  (g) => (gatewayConfigs[g] as GatewayConfig).completions
)

export function gatewayConfig(name: GatewayName): GatewayConfig {
  return gatewayConfigs[name]
}
