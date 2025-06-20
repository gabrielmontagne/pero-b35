# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pero-B35 is a TypeScript CLI tool that provides a thin wrapper around OpenAI-compatible APIs for comfortable command-line chat interactions. It's built with RxJS for reactive programming and supports multiple AI gateways (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, DeepSeek).

## Key Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run dev` - Watch mode development with automatic rebuilds
- `npm run test` - Run tests using Vitest
- `npm run prettier-format` - Format code according to project style

### Running the CLI
- `npx pero chat` - Start chat interface
- `npx pero chat -f <file>` - Read from file instead of stdin
- `npx pero chat -m <model>` - Specify model (default: openai/gpt-4o)
- `npx pero chat -g <gateway>` - Choose gateway (openai, openrouter, anthropic, etc.)
- `npx pero chat -t <tools.yaml>` - Load additional tools configuration
- `npx pero chat -o` - Output only mode (no chat formatting)
- `npx pero chat -r` - Include reasoning in output

## Architecture

### Core Components

**Entry Point** (`src/index.ts`): Handles environment setup and CLI routing using yargs.

**Chat Command** (`src/lib/chat.ts`): Main command implementation that orchestrates the entire chat flow using RxJS streams. Supports multiple AI gateways and handles tool configuration.

**Session Management** (`src/lib/scan.ts`): Manages chat completions with recursive tool calling support. Handles the interaction with OpenAI-compatible APIs and tool execution loops.

**Text Processing** (`src/lib/restructure.ts`): Handles parsing and formatting of chat sessions. Supports special syntax for role headers (S>>, Q>>, A>>) and __START__/__END__ markers for content boundaries.

**Tools System** (`src/lib/tools.ts`): Dynamic tool system that converts YAML tool definitions into OpenAI function calling format. Executes shell commands with parameter interpolation using {{parameter}} syntax.

### Data Flow

1. Input text is processed through `startEndSplit` to separate leading/trailing content
2. Main content is parsed into chat session format with role detection
3. User messages are processed through `interpolate()` to handle file/image tags
4. Session is sent to AI gateway with tool definitions
5. Tool calls are executed as shell commands with parameter substitution
6. Results are recombined and formatted for output

### Content Interpolation

User messages support special tags for including files, images, and audio:
- `[txt[path/to/file.txt]]` - Includes text file content wrapped in `<FILE>` tags
- `[img[path/to/image.jpg]]` - Includes local image as base64 data URI
- `[img[https://example.com/image.jpg]]` - Includes remote image by URL
- `[audio[path/to/audio.wav]]` - Includes audio file for supported gateways

Audio files are processed according to gateway-specific formats:
- **OpenAI**: Uses `input_audio` format with base64 data
- **Gemini**: Uses `inline_data` format with MIME type
- **Other gateways**: Default to OpenAI format

Supported audio formats: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.webm`

These tags are processed by `src/lib/interpolate.ts` and converted to appropriate multimodal content formats.

### Tool Configuration

Tools are defined in YAML format (`tools.yaml`) with:
- `description`: Tool description for the AI
- `parameters`: Parameter definitions with descriptions
- `command`: Shell command template with {{parameter}} placeholders
- `stdin_param`: Optional parameter to pass via stdin

## Environment Setup

Create `.env` file in project root with required API keys:
```
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

## Testing

- Uses Vitest framework with global test environment
- Test files use `.spec.ts` extension
- RxJS testing utilities for reactive stream testing
- Run single test: Use Vitest's file filtering (e.g., `npm test tools.spec.ts`)

## Code Style

- Uses Prettier with specific config: no semicolons, single quotes, 80 char width, ES5 trailing commas
- TypeScript with strict mode enabled
- Functional programming patterns with RxJS
- Error handling through RxJS catchError operators