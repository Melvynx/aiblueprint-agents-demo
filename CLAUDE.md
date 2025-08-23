# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Available Commands

- `bun install` - Install dependencies
- `bun run start` or `bun run dev` - Run the main agent demo (index.ts)
- `bun run modern` - Run the enhanced modern version (simple-modern.ts)
- `bun run tsc` - Verify TypeScript errors
- `bun run index.ts` - Direct execution of main agent

## Project Architecture

This is an AI agent demonstration project that showcases different approaches to building conversational AI tools with file system access and command execution capabilities.

### Core Components

**Main Agent (index.ts)**:

- Command-line AI agent using OpenAI GPT-5
- XML-based tool syntax for file operations, bash commands, web fetching
- Tools: readfile, writefile, bash, get_tweet, grep, glob, ls, webfetch
- Recursive conversation loop with tool execution

**Model Configuration (models.ts)**:

- Exports configured AI SDK providers for OpenAI and Anthropic
- Centralized model access point

### Technology Stack

- **Runtime**: Bun (fast JavaScript runtime)
- **AI SDK**: Vercel AI SDK with OpenAI and Anthropic providers
- **Utilities**: cheerio for HTML parsing, marked/turndown for markdown conversion

### Key Patterns

1. **Tool Execution Architecture**: Both agents parse AI responses for XML tool tags, execute corresponding functions, and feed results back to the AI in a conversation loop

2. **File System Tools**: Standardized file operations (read/write) with size formatting and error handling

3. **Command Execution**: Safe bash command execution with output capturing and error handling

4. **Web Integration**: HTML fetching with markdown conversion for web content processing

5. **Conversation Management**: Message history maintenance for context-aware AI interactions

### Development Notes

- Uses ES modules and modern TypeScript
- Strict TypeScript configuration with latest features
- No build step required - direct TypeScript execution with Bun
- Legacy folder contains alternative implementations and experiments
