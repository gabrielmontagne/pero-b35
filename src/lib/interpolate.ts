import { promises as fs } from 'fs'
import * as path from 'path'
import {
  ChatCompletionContentPart,
  ChatCompletionContentPartImage,
  ChatCompletionContentPartText,
} from 'openai/resources'

type AudioFormat = 'openai' | 'gemini'

// For now, we'll store audio as text with metadata
// and convert it at the gateway level later
interface AudioMetadata {
  isAudio: true
  data: string
  mimeType: string
  extension: string
  audioFormat?: string
}

const tagToParser = {
  txt: loadText,
  img: loadImage,
  audio: loadAudio,
}

const audioFormatters = {
  openai: (base64: string, extension: string) => ({
    type: 'input_audio' as const,
    input_audio: {
      data: base64,
      format: extension.slice(1), // .wav -> wav
    },
  }),

  gemini: (base64: string, mimeType: string) => ({
    inline_data: {
      mime_type: mimeType,
      data: base64,
    },
  }),
}

const tag = /\[(?<type>\w+)\[(?<content>[^\]]+)\]\]/g
const markdownImg = /!\[[^\]]*\]\((?<src>[^)]+)\)/g

type Match = {
  index: number
  length: number
  type: 'tag' | 'mdimg'
  data: string
}

function collectMatches(text: string): Match[] {
  const matches: Match[] = []

  let m: RegExpExecArray | null
  const tagRe = new RegExp(tag.source, 'g')
  const mdRe = new RegExp(markdownImg.source, 'g')

  while ((m = tagRe.exec(text)) !== null) {
    const { type, content } = m.groups as { type: string; content: string }
    if (isKnownTag(type)) {
      matches.push({
        index: m.index,
        length: m[0].length,
        type: 'tag',
        data: m[0],
      })
    }
  }

  while ((m = mdRe.exec(text)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      type: 'mdimg',
      data: m.groups!.src,
    })
  }

  return matches.sort((a, b) => a.index - b.index)
}

export async function interpolate(
  text: string,
  gatewayConfig?: { audioFormat?: string }
) {
  const parts: ChatCompletionContentPart[] = []
  const matches = collectMatches(text)

  let lastIndex = 0

  for (const match of matches) {
    const leadingText = text.slice(lastIndex, match.index)
    if (leadingText) parts.push(packText(leadingText))

    if (match.type === 'mdimg') {
      parts.push(await loadImage(match.data))
    } else {
      const tagMatch = tag.exec(match.data)
      tag.lastIndex = 0
      if (tagMatch) {
        const { type, content } = tagMatch.groups as {
          type: string
          content: string
        }
        const parser = tagToParser[type as keyof typeof tagToParser]
        if (type === 'audio') {
          parts.push(await parser(content, gatewayConfig))
        } else {
          parts.push(await parser(content))
        }
      }
    }

    lastIndex = match.index + match.length
  }

  const remainingText = text.slice(lastIndex)
  if (remainingText) parts.push(packText(remainingText))

  // Filter out whitespace-only text parts - some APIs (Anthropic) reject empty text blocks
  return parts.filter((part) => part.type !== 'text' || part.text.trim() !== '')
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
  const mimeType = getImageMimeType(path.extname(content).toLowerCase())
  const dataUri = `data:${mimeType};base64,${base64}`
  const result: ChatCompletionContentPartImage = {
    type: 'image_url',
    image_url: { url: dataUri },
  }
  return result
}

function isKnownTag(tag: string): tag is keyof typeof tagToParser {
  return tag in tagToParser
}

async function loadAudio(
  content: string,
  gatewayConfig?: { audioFormat?: string }
) {
  const isRemote = /^https?:/
  if (isRemote.test(content)) {
    // For remote URLs, we'd need to fetch and convert - for now, return error
    throw new Error('Remote audio URLs not yet supported')
  }

  try {
    const fileContent = await fs.readFile(content)
    const base64 = fileContent.toString('base64')
    const extension = path.extname(content).toLowerCase()
    const mimeType = getAudioMimeType(extension)
    const audioFormat = gatewayConfig?.audioFormat || 'openai'

    // For now, store as text with metadata that can be processed later
    const audioMetadata: AudioMetadata = {
      isAudio: true,
      data: base64,
      mimeType,
      extension,
      audioFormat,
    }

    const result: ChatCompletionContentPartText = {
      type: 'text',
      text: `<AUDIO_FILE path="${content}" metadata="${Buffer.from(JSON.stringify(audioMetadata)).toString('base64')}"></AUDIO_FILE>`,
    }
    return result
  } catch (error) {
    console.error(`Error reading audio file at ${content}:`, error)
    throw error
  }
}

function getImageMimeType(extension: string): string {
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  return mimeMap[extension] || 'image/png'
}

function getAudioMimeType(extension: string): string {
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.webm': 'audio/webm',
  }
  return mimeMap[extension] || 'audio/mpeg'
}
