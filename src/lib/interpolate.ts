import { promises as fs } from 'fs'
import * as path from 'path'
import {
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
} from 'openai/resources'

const tagToParser = {
  txt: loadText,
  img: loadImage,
}

const tag = /\[(?<type>\w+)\[(?<content>[^\]]+)\]\]/g

export async function interpolate(text: string) {
  const parts: ChatCompletionContentPart[] = []

  let match: RegExpExecArray | null
  let lastIndex = 0
  while ((match = tag.exec(text)) !== null) {
    const { groups, index } = match
    const fullTag = match[0]
    const { type, content } = groups as { type: string; content: string }
    const leadingText = text.slice(lastIndex, index)
    if (leadingText) parts.push(packText(leadingText))

    if (isKnownTag(type)) {
      const parser = tagToParser[type]
      parts.push(await parser(content))
    }

    lastIndex = index + fullTag.length
  }

  const remeainingText = text.slice(lastIndex)
  if (remeainingText) parts.push(packText(remeainingText))
  return parts
}

function packText(text: string) {
  const result: ChatCompletionContentPartText = { type: 'text', text }
  return result
}

async function loadText(path: string) {
  try {
    const fileContent = await fs.readFile(path, 'utf-8')
    const result: ChatCompletionContentPartText = {
      type: 'text',
      text: `<FILE path="${path}">${fileContent}</FILE>`,
    }
    return result
  } catch (error) {
    console.error(`Error reading file at ${path}:`, error)
    throw error
  }
}

async function loadImage(content: string) {
  const isRemote = /^https?:/
  if (isRemote.test(content)) {
    const result: ChatCompletionContentPartImage = {
      type: 'image_url',
      image_url: { url: content },
    }
    return result
  }

  const fileContent = await fs.readFile(content)
  const base64 = fileContent.toString('base64')
  const mimeType = path.extname(content).slice(1)
  const dataUri = `data:image/${mimeType};base64,${base64}`
  const result: ChatCompletionContentPartImage = {
    type: 'image_url',
    image_url: { url: dataUri },
  }
  return result
}

function isKnownTag(tag: string): tag is keyof typeof tagToParser {
  return tag in tagToParser
}
