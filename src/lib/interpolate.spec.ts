import { describe, expect, it } from 'vitest'
import { interpolate } from './interpolate'
import { ChatCompletionContentPartText } from 'openai/resources'

describe('interpolate', () => {
  it('should handle text interpolation', async () => {
    const result = await interpolate('Hello world')
    expect(result).toEqual([{ type: 'text', text: 'Hello world' }])
  })

  it('should handle markdown image with remote URL', async () => {
    const result = await interpolate(
      'Check this: ![alt text](https://example.com/img.png)'
    )
    expect(result).toEqual([
      { type: 'text', text: 'Check this: ' },
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ])
  })

  it('should handle markdown image with empty alt', async () => {
    const result = await interpolate('![](https://example.com/img.png)')
    expect(result).toEqual([
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ])
  })

  it('should handle mixed tiddlywiki and markdown images', async () => {
    const result = await interpolate(
      'A: [img[https://a.com/1.png]] B: ![x](https://b.com/2.png)'
    )
    expect(result).toEqual([
      { type: 'text', text: 'A: ' },
      { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
      { type: 'text', text: ' B: ' },
      { type: 'image_url', image_url: { url: 'https://b.com/2.png' } },
    ])
  })

  it('should handle audio file interpolation with openai format', async () => {
    const result = await interpolate('[audio[test-audio.wav]]', {
      audioFormat: 'openai',
    })
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    const textPart = result[0] as ChatCompletionContentPartText
    expect(textPart.text).toMatch(
      /^<AUDIO_FILE path="test-audio\.wav" metadata="[^"]+"><\/AUDIO_FILE>$/
    )

    // Decode and check metadata
    const metadataMatch = textPart.text.match(/metadata="([^"]+)"/)
    expect(metadataMatch).toBeTruthy()

    const decodedMetadata = JSON.parse(
      Buffer.from(metadataMatch![1], 'base64').toString()
    )
    expect(decodedMetadata.isAudio).toBe(true)
    expect(decodedMetadata.mimeType).toBe('audio/wav')
    expect(decodedMetadata.extension).toBe('.wav')
    expect(decodedMetadata.audioFormat).toBe('openai')
    expect(decodedMetadata.data).toBeTruthy()
  })

  it('should handle audio file interpolation with gemini format', async () => {
    const result = await interpolate('[audio[test-audio.wav]]', {
      audioFormat: 'gemini',
    })
    expect(result).toHaveLength(1)

    const textPart = result[0] as ChatCompletionContentPartText
    const metadataMatch = textPart.text.match(/metadata="([^"]+)"/)
    const decodedMetadata = JSON.parse(
      Buffer.from(metadataMatch![1], 'base64').toString()
    )
    expect(decodedMetadata.audioFormat).toBe('gemini')
  })

  it('should handle mixed content with text and audio', async () => {
    const result = await interpolate(
      'Here is some audio: [audio[test-audio.wav]] and more text'
    )
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', text: 'Here is some audio: ' })
    expect(result[1].type).toBe('text')
    const audioTextPart = result[1] as ChatCompletionContentPartText
    expect(audioTextPart.text).toMatch(/^<AUDIO_FILE/)
    expect(result[2]).toEqual({ type: 'text', text: ' and more text' })
  })

  it('should default to openai format when no gateway config provided', async () => {
    const result = await interpolate('[audio[test-audio.wav]]')
    const textPart = result[0] as ChatCompletionContentPartText
    const metadataMatch = textPart.text.match(/metadata="([^"]+)"/)
    const decodedMetadata = JSON.parse(
      Buffer.from(metadataMatch![1], 'base64').toString()
    )
    expect(decodedMetadata.audioFormat).toBe('openai')
  })
})
