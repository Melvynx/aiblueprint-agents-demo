import { openai } from "@ai-sdk/openai";
import * as clack from "@clack/prompts";
import { generateText } from "ai";

// =============================================================================
// BEAUTIFUL CONSOLE LOGGING WITH COLORS & BORDERS
// =============================================================================

class BeautifulLogger {
  private colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    bgBlue: '\x1b[44m',
    bgGreen: '\x1b[42m',
    bgRed: '\x1b[41m',
    bgYellow: '\x1b[43m',
  };

  private getTerminalWidth(): number {
    return Math.min(process.stdout.columns || 80, 90); // Max 90 chars
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private box(content: string, color: string = this.colors.blue): string {
    const termWidth = this.getTerminalWidth();
    const maxContentWidth = termWidth - 4; // Account for borders and padding
    
    const allLines: string[] = [];
    content.split('\n').forEach(line => {
      if (line.length <= maxContentWidth) {
        allLines.push(line);
      } else {
        allLines.push(...this.wrapText(line, maxContentWidth));
      }
    });
    
    const actualWidth = Math.min(termWidth, Math.max(40, ...allLines.map(line => line.length)) + 4);
    const border = '─'.repeat(actualWidth - 2);
    const header = `┌${border}┐`;
    const footer = `└${border}┘`;
    
    const paddedLines = allLines.map(line => {
      const padding = ' '.repeat(Math.max(0, actualWidth - line.length - 4));
      return `│ ${line}${padding} │`;
    });

    return color + [header, ...paddedLines, footer].join('\n') + this.colors.reset;
  }

  toolCall(toolName: string, params: string): void {
    const content = `🔧 ${toolName.toUpperCase()} ${params}`;
    console.log('\n' + this.box(content, this.colors.blue));
  }

  toolResult(result: string, isSuccess: boolean = true): void {
    const color = isSuccess ? this.colors.green : this.colors.red;
    const icon = isSuccess ? '✅' : '❌';
    const title = isSuccess ? 'RESULT' : 'ERROR';
    
    const content = `${icon} ${title}\n${result}`;
    console.log(this.box(content, color));
  }

  aiMessage(content: string): void {
    console.log('\n' + this.box(`🤖 AI RESPONSE\n${content}`, this.colors.magenta));
  }

  userMessage(content: string): void {
    console.log('\n' + this.box(`💭 YOU\n${content}`, this.colors.cyan));
  }

  processing(message: string): void {
    console.log('\n' + this.colors.yellow + this.colors.bold + `⚡ ${message}` + this.colors.reset);
  }

  separator(): void {
    console.log('\n' + this.colors.gray + '═'.repeat(80) + this.colors.reset);
  }

  header(): void {
    const title = '🚀 AGENT DEMO - Educational Tool Usage Simulator';
    const subtitle = 'Modern terminal interface with beautiful logging';
    const tools = 'Available tools: readfile, writefile, list, bash';
    
    console.clear();
    console.log('\n' + this.box(title, this.colors.bgBlue + this.colors.bold, 70));
    console.log(this.box(subtitle, this.colors.gray, 70));
    console.log(this.box(tools, this.colors.yellow, 70));
    console.log('\n');
  }
}

// =============================================================================
// ENHANCED TOOL EXECUTION WITH ANIMATIONS
// =============================================================================

class EnhancedFileOperations {
  private logger = new BeautifulLogger();
  
  private decodeHtmlEntities(content: string): string {
    return content
      .replace(/&quot;/g, '"')
      .replace(/\\"/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private async withAnimation<T>(
    toolName: string,
    params: string,
    operation: () => Promise<T>,
    formatResult: (result: T) => string,
    duration: number = 2000
  ): Promise<T> {
    this.logger.toolCall(toolName, params);
    
    // Show processing animation
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[frameIndex]} Processing...`);
      frameIndex = (frameIndex + 1) % frames.length;
    }, 100);

    try {
      // Wait for the specified duration to show the animation
      await new Promise(resolve => setTimeout(resolve, duration));
      
      const result = await operation();
      
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(20) + '\r'); // Clear the line
      
      this.logger.toolResult(formatResult(result), true);
      return result;
    } catch (error) {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(20) + '\r'); // Clear the line
      
      this.logger.toolResult((error as Error).message, false);
      throw error;
    }
  }

  async readFile(filename: string): Promise<string> {
    return this.withAnimation(
      'readfile',
      `file="${filename}"`,
      async () => {
        const file = Bun.file(filename);
        return await file.text();
      },
      (content) => `📄 ${content.length} characters\n${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`,
      1800
    );
  }

  async writeFile(filename: string, content: string): Promise<string> {
    return this.withAnimation(
      'writefile',
      `file="${filename}" content="..."`,
      async () => {
        const decodedContent = this.decodeHtmlEntities(content);
        const fileExists = await Bun.file(filename).exists();
        
        await Bun.write(filename, decodedContent);
        return `Successfully ${fileExists ? "updated" : "created"} ${filename}`;
      },
      (result) => `📝 ${result}\nContent preview: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`,
      2200
    );
  }

  async listFiles(): Promise<string> {
    return this.withAnimation(
      'list',
      '',
      async () => {
        const files = await Array.fromAsync(new Bun.Glob("*").scan("."));
        const dirs = await Array.fromAsync(new Bun.Glob("*/").scan("."));
        return [...dirs, ...files].sort().join(" ");
      },
      (result) => `📂 ${result.split(' ').length} items found\n${result}`,
      1500
    );
  }

  async runBashCommand(command: string): Promise<string> {
    return this.withAnimation(
      'bash',
      `command="${command}"`,
      async () => {
        const proc = Bun.spawn(command.split(" "), {
          stdout: "pipe",
          stderr: "pipe",
        });

        const output = await new Response(proc.stdout).text();
        const error = await new Response(proc.stderr).text();
        
        await proc.exited;

        if (proc.exitCode === 0) {
          return output || "Command completed successfully";
        } else {
          throw new Error(`Command failed with exit code ${proc.exitCode}: ${error}`);
        }
      },
      (output) => `⚡ Exit code: 0\n${output.slice(0, 400)}${output.length > 400 ? '...' : ''}`,
      2500
    );
  }
}

// =============================================================================
// ENHANCED AGENT DEMO
// =============================================================================

class EnhancedAgentDemo {
  private logger = new BeautifulLogger();
  private fileOperations = new EnhancedFileOperations();
  private conversationHistory: Array<{role: "system" | "user" | "assistant", content: string}> = [];

  // Tool registry (same as before)
  private tools = {
    readfile: {
      regex: /<readfile\s+file="([^"]+)"\s*\/>/g,
      handler: (params: Record<string, string>) => this.fileOperations.readFile(params.file)
    },
    writefile: {
      regex: /<writefile\s+file="([^"]+)"\s+content="([\s\S]*?)"\s*\/>/g,
      handler: (params: Record<string, string>) => this.fileOperations.writeFile(params.file, params.content)
    },
    list: {
      regex: /<list\s*\/>/g,
      handler: () => this.fileOperations.listFiles()
    },
    bash: {
      regex: /<bash\s+command="([^"]+)"\s*\/>/g,
      handler: (params: Record<string, string>) => this.fileOperations.runBashCommand(params.command)
    }
  };

  private parseTools(text: string) {
    const parsedTools: Array<{name: string, parameters: Record<string, string>}> = [];
    
    for (const [toolName, toolDef] of Object.entries(this.tools)) {
      const regex = new RegExp(toolDef.regex.source, 'g');
      let match: RegExpExecArray | null;
      
      console.log(`\n🔍 DEBUG: Testing ${toolName} regex on text...`);
      if (toolName === 'writefile') {
        console.log(`🔍 DEBUG: Writefile regex: ${toolDef.regex.source}`);
        console.log(`🔍 DEBUG: Text contains '<writefile': ${text.includes('<writefile')}`);
      }
      
      while ((match = regex.exec(text)) !== null) {
        console.log(`🔍 DEBUG: Found ${toolName} match:`, match);
        const parameters: Record<string, string> = {};
        
        if (toolName === 'readfile') {
          parameters.file = match[1];
        } else if (toolName === 'writefile') {
          parameters.file = match[1];
          parameters.content = match[2];
        } else if (toolName === 'bash') {
          parameters.command = match[1];
        }
        
        parsedTools.push({ name: toolName, parameters });
      }
    }
    
    return parsedTools;
  }

  private generateSystemPrompt(): string {
    return `You are an AI assistant with access to file operations. You can use the following tools:

<readfile file="filename.txt" /> - Read the contents of a file
<writefile file="filename.txt" content="new content here" /> - Create or overwrite a file
<list /> - List all files and directories in the current directory
<bash command="command here" /> - Execute a bash command

🚨 CRITICAL EXECUTION RULES - FOLLOW EXACTLY:

1. TOOL USAGE PATTERN:
   - Use ONLY ONE tool per response
   - STOP immediately after the tool call
   - NEVER write anything after a tool call
   - NEVER predict what the tool output will be
   - Wait for actual tool results before continuing

2. RESPONSE STRUCTURE:
   - Brief explanation (1-2 sentences max)
   - Tool call
   - STOP - Absolutely NO more text allowed

3. FORBIDDEN BEHAVIORS:
   - ❌ NEVER write multiple tools in one response
   - ❌ NEVER write "Tool readfile result:" or similar
   - ❌ NEVER write assumed outputs like "The file contains..."
   - ❌ NEVER continue writing after a tool

4. CORRECT EXAMPLE:
   "I'll read the file to check its contents.
   
   <readfile file="test.js" />"

5. WRONG EXAMPLE:
   "I'll read the file.
   <readfile file="test.js" />
   The file contains... [FORBIDDEN]"

CRITICAL: After ANY tool call, STOP immediately. Wait for real results!`;
  }

  async processMessage(userMessage: string): Promise<void> {
    if (!userMessage.trim()) return;

    this.logger.userMessage(userMessage);

    // Initialize conversation if needed
    if (this.conversationHistory.length === 0) {
      this.conversationHistory = [{ role: "system", content: this.generateSystemPrompt() }];
    }
    this.conversationHistory.push({ role: "user", content: userMessage });

    try {
      this.logger.processing("Sending request to GPT-4o...");

      const { text } = await generateText({
        model: openai("gpt-4o"),
        messages: this.conversationHistory,
        temperature: 0.7,
      });

      this.logger.aiMessage(text);
      this.conversationHistory.push({ role: "assistant", content: text });

      // Debug: show the raw text we're parsing
      console.log(`\n🔍 DEBUG: Raw AI text:`, JSON.stringify(text));

      // Parse and execute tools
      const parsedTools = this.parseTools(text);
      console.log(`\n🔍 DEBUG: Found ${parsedTools.length} tools:`, parsedTools);
      
      if (parsedTools.length > 0) {
        const toolResults: string[] = [];
        
        for (const parsedTool of parsedTools) {
          console.log(`\n🔍 DEBUG: Executing tool:`, parsedTool);
          const toolDef = this.tools[parsedTool.name as keyof typeof this.tools];
          if (!toolDef) {
            console.log(`\n❌ DEBUG: Tool ${parsedTool.name} not found in registry`);
            continue;
          }
          const result = await toolDef.handler(parsedTool.parameters);
          toolResults.push(`Tool ${parsedTool.name} result: ${result}`);
        }

        // Continue conversation with tool results
        const toolResultsMessage = toolResults.join('\n');
        this.conversationHistory.push({ role: "user", content: toolResultsMessage });
        
        this.logger.separator();
        this.logger.processing("Sending tool results back to AI...");
        
        // Get follow-up response
        const { text: followupText } = await generateText({
          model: openai("gpt-4o"),
          messages: this.conversationHistory,
          temperature: 0.7,
        });

        this.logger.aiMessage(followupText);
        this.conversationHistory.push({ role: "assistant", content: followupText });
      }

    } catch (error) {
      this.logger.toolResult(`Error: ${(error as Error).message}`, false);
    }
  }

  async start(): Promise<void> {
    this.logger.header();
    
    // Create sample file
    try {
      await Bun.write("input.txt", "This is a sample file for testing.\nYou can read and edit this file using the agent tools.");
      console.log('📁 Created sample file: input.txt\n');
    } catch (error) {
      // Ignore
    }

    while (true) {
      const input = await clack.text({
        message: "What would you like me to help you with?",
        placeholder: "Type your request...",
      });

      if (clack.isCancel(input) || input.toLowerCase() === 'exit') {
        clack.outro("👋 Goodbye!");
        break;
      }

      await this.processMessage(input);
      this.logger.separator();
    }
  }
}

// Start the enhanced demo
async function main() {
  const demo = new EnhancedAgentDemo();
  await demo.start();
}

main().catch(console.error);