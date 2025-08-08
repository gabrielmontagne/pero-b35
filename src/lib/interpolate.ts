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

export async function interpolate(text: string, gatewayConfig?: { audioFormat?: string }) {
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
      if (type === 'audio') {
        parts.push(await parser(content, gatewayConfig))
      } else {
        parts.push(await parser(content))
      }
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

async function loadAudio(content: string, gatewayConfig?: { audioFormat?: string }) {
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
