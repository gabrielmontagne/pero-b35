import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText } from "openai/resources";

const tagToParser = {
  txt: loadText,
  web: loadPage,
  img: loadImage,
}

const tag = /\[(?<type>\w+)\[(?<content>[^\]]+)\]\]/g;

export function interpolate(text: string): ChatCompletionContentPart[] {

  const parts: ChatCompletionContentPart[] = [ ]

  let match: RegExpExecArray | null
  let lastIndex = 0
  while ((match = tag.exec(text)) !== null) {

    const { groups, index } = match
    const fullTag = match[0]
    const { type, content } = groups as { type: string, content: string }
    const leadingText = text.slice(lastIndex, index)
    parts.push(packText(leadingText))

    if (isKnownTag(type)) {
      const parser = tagToParser[type]
      parts.push(parser(content))
    }

    lastIndex = index + fullTag.length
  }

  parts.push(packText(text.slice(lastIndex)))
  return parts
}


function packText(text: string) {
  // tbc
  const result:ChatCompletionContentPartText = { type: 'text', text }
  return result
}

function loadText(path: string) {
  const result:ChatCompletionContentPartText = { type: 'text', text:path }
  return result
}

function loadPage(web: string): ChatCompletionContentPartText {
  const result:ChatCompletionContentPartText = { type: 'text', text:web }
  return result
}

function loadImage(content: string) {
  // tbc
  const result:ChatCompletionContentPartImage = { type: 'image_url', image_url: { url: `IMG: ${content}` } }
  return result
}

function isKnownTag(tag:string): tag is keyof typeof tagToParser {
  return tag in tagToParser
}