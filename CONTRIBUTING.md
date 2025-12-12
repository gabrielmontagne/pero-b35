# Pero-B35

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
- `npx pero chat -m <model>` - Specify model (default: anthropic/claude-sonnet-4.5)
- `npx pero chat -g <gateway>` - Choose gateway (openai, openrouter, anthropic, etc.)
- `npx pero chat -t <tools.yaml>` - Load additional tools configuration
- `npx pero chat -o` - Output only mode (no chat formatting)
- `npx pero chat -r` - Include reasoning in output

## Architecture

### Core Components

**Entry Point** (`src/index.ts`): Handles environment setup and CLI routing using yargs.

**Chat Command** (`src/lib/chat.ts`): Main command implementation that orchestrates the entire chat flow using RxJS streams. Supports multiple AI gateways and handles tool configuration.

**Session Management** (`src/lib/scan.ts`): Manages chat completions with recursive tool calling support. Handles the interaction with OpenAI-compatible APIs and tool execution loops.

**Text Processing** (`src/lib/restructure.ts`): Handles parsing and formatting of chat sessions. Supports special syntax for role headers (S>>, Q>>, A>>) and **START**/**END** markers for content boundaries. Lines starting with `%%%` are treated as comments and filtered out during processing.

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
- `enabled`: Optional boolean to disable a tool (default: true)
- `timeout`: Optional timeout in milliseconds
  - Bash tools: No default (runs indefinitely)
  - On timeout: Tool returns error message, underlying process is aborted and killed

## Environment Setup

Create `.env` file in project root with required API keys:

```
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
```

## Implementation preferences

- Observables-first: treat RxJS Observables as a project “primitive”.
- Do not mix Promises and Observables in production paths; keep flows Observable end-to-end. Only bridge at boundaries if absolutely necessary.
- Compose with small, pure Rx operators; push side effects to sinks/subscribers.
- One options shape (ChatRunOptions) consumed by all journeys (CLI, server). Parse CLI flags and HTTP query params into this shape.
- Prefer kebab-case for CLI flags and HTTP query params; keep internal API camelCase if needed, but adapt once at the boundary.
- Reuse helpers for tool configuration:
  - resolveAutoToolsPath(cwd, defaultPath)
  - compute final tool paths consistently for chat and serve
- Prefer SSS (Simplest Solution Soonest): avoid adding new dependencies or abstractions unless required.
- Tests: you may use firstValueFrom in tests for convenience, but keep production code Observables-only.

```

```
