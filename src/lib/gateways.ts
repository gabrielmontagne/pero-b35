export const gateways = [
  'ollama',
  'openrouter',
  'gemini',
  'anthropic',
  'openai',
  'deepseek',
  'copilot',
] as const

export type Gateway = (typeof gateways)[number]
