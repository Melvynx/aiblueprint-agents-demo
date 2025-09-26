# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based AI coding assistant called "MelvynCode" that provides an interactive CLI interface with tool-calling capabilities. The agent uses OpenAI's GPT-5 model through the AI SDK and runs on Bun runtime.

## Architecture

The project is structured as a single-file agent (`index.ts`) that implements a conversational loop with the following key components:

- **System Prompt**: Defines the agent's identity and available tools
- **Tool System**: Custom XML-based tool parsing and execution
- **Message Management**: Maintains conversation history with proper role separation
- **Interactive CLI**: Prompt-based interface for user interaction

### Core Agent Flow
1. User provides input through CLI prompt
2. AI generates response using OpenAI GPT-5
3. Tool parser extracts tool calls from AI response
4. Tools execute sequentially with results fed back to AI
5. Process continues until no more tools are called

### Available Tools
- `readfile`: Read any file in the current directory
- `writefile`: Write content to files (requires reading first)
- `bash`: Execute bash commands (with safety restrictions)
- `get_tweet`: Mock Twitter API integration
- `grep`: Search patterns in files using git ls-files + grep
- `glob`: Find files by pattern using find command

## Development Commands

### Running the Agent
```bash
bun run start    # Start the interactive agent
bun run dev      # Same as start
```

### Code Quality Checks
```bash
# TypeScript type checking
bunx tsc --noEmit

# ESLint checking
bunx eslint .

# ESLint fixing
bunx eslint . --fix
```

### Project Structure
- `index.ts` - Main agent implementation with all functionality
- `models.ts` - Model configurations (if used)
- `legacy/` - Previous agent implementations (ignored by ESLint)
- `eslint.config.ts` - ESLint configuration with TypeScript support
- `tsconfig.json` - TypeScript configuration for Bun bundler mode

## Technical Details

- **Runtime**: Bun (requires Bun installation)
- **Model**: OpenAI GPT-5 via AI SDK
- **Type Safety**: Strict TypeScript with recommended ESLint rules
- **Tool Parsing**: Custom regex-based XML tool extraction
- **File Operations**: Uses Bun.file() and Bun.write() APIs
- **Process Execution**: Uses Bun.spawnSync() for bash commands

## Important Notes

- The agent expects OPENAI_API_KEY environment variable
- Tools use XML-like syntax: `<toolname param="value" />`
- Agent follows one-tool-per-response pattern
- File operations include size formatting and error handling
- Bash commands are filtered for safety (no rm -rf, etc.)
- Git-aware grep searches only tracked files