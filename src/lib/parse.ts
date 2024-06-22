import { ChatCompletionMessageParam } from "openai/resources";

export function parseMessages(text: string): ChatCompletionMessageParam[] {
    return [
        { role: 'user' as const, content: text }
    ]
}