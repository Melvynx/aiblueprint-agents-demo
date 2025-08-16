import { openai } from "@ai-sdk/openai";
import * as clack from "@clack/prompts";
import { generateText } from "ai";

// =============================================================================
// TYPES & INTERFACES - Define all type definitions
// =============================================================================

interface ToolParameter {
  name: string;
  description: string;
  required: boolean;
  example: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  xmlFormat: string;
  regex: RegExp;
  handler: (params: Record<string, string>) => Promise<string>;
}

interface ParsedTool {
  name: string;
  parameters: Record<string, string>;
}

interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// =============================================================================
// FILE OPERATIONS - Handle all file system operations
// =============================================================================

class FileOperations {
  private decodeHtmlEntities(content: string): string {
    return content
      .replace(/&quot;/g, '"')
      .replace(/\\"/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private async withToolExecution<T>(
    toolName: string,
    params: string,
    operation: () => Promise<T>,
    previewResult: (result: T) => string,
    delayMs: number = 2000
  ): Promise<T> {
    const spinner = clack.spinner();
    
    try {
      // Start with tool call info
      clack.log.step(`🔧 ${toolName.toUpperCase()} ${params}`);
      
      spinner.start(`Processing...`);
      
      // Longer delay to show work being done
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      const result = await operation();
      
      spinner.stop(`✅ Completed`);
      
      // Show result preview in a nice box
      clack.log.info(previewResult(result));
      clack.log.message(''); // Add spacing after each tool
      
      return result;
    } catch (error) {
      spinner.stop(`❌ Failed`);
      clack.log.error(`Error: ${(error as Error).message}`);
      clack.log.message(''); // Add spacing after error
      throw error;
    }
  }

  async readFile(filename: string): Promise<string> {
    try {
      const content = await this.withToolExecution(
        "readfile",
        `file="${filename}"`,
        async () => {
          const file = Bun.file(filename);
          return await file.text();
        },
        (content) => `📄 ${content.length} characters\n   ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`
      );

      return content;
    } catch (error) {
      return `Error: Could not read file ${filename}: ${(error as Error).message}`;
    }
  }

  async writeFile(filename: string, content: string): Promise<string> {
    try {
      const decodedContent = this.decodeHtmlEntities(content);
      const fileExists = await Bun.file(filename).exists();
      
      const result = await this.withToolExecution(
        "writefile",
        `file="${filename}" content="..."`,
        async () => {
          await Bun.write(filename, decodedContent);
          return `Successfully ${fileExists ? "updated" : "created"} ${filename}`;
        },
        (result) => `${fileExists ? "📝 Updated" : "📄 Created"} ${decodedContent.length} characters\n   ${decodedContent.slice(0, 200)}${decodedContent.length > 200 ? "..." : ""}`,
        2200 // Longer for file writing
      );

      return result;
    } catch (error) {
      return `Error: Could not write to file ${filename}: ${(error as Error).message}`;
    }
  }

  async listFiles(): Promise<string> {
    try {
      const allEntries = await this.withToolExecution(
        "list",
        "",
        async () => {
          const files = await Array.fromAsync(new Bun.Glob("*").scan("."));
          const dirs = await Array.fromAsync(new Bun.Glob("*/").scan("."));
          return [...dirs, ...files].sort();
        },
        (entries) => `📂 ${entries.length} items found\n   ${entries.join(" ")}`,
        1800 // Medium timing for directory scan
      );

      return allEntries.join(" ");
    } catch (error) {
      return `Error: Could not list directory: ${(error as Error).message}`;
    }
  }

  async runBashCommand(command: string): Promise<string> {
    try {
      const result = await this.withToolExecution(
        "bash",
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
        (output) => `⚡ Exit code: 0\n   ${output.slice(0, 300)}${output.length > 300 ? "..." : ""}`,
        2500 // Longest timing for bash commands
      );

      return result;
    } catch (error) {
      return `Error: Could not execute command: ${(error as Error).message}`;
    }
  }
}

// =============================================================================
// TOOL REGISTRY - Configuration for all available tools
// =============================================================================

class ToolRegistry {
  private fileOperations = new FileOperations();
  
  readonly tools: Record<string, ToolDefinition> = {
    readfile: {
      name: "readfile",
      description: "Read the contents of a file",
      parameters: [
        {
          name: "file",
          description: "Path to the file to read",
          required: true,
          example: "hello.js"
        }
      ],
      xmlFormat: '<readfile file="filename.txt" />',
      regex: /<readfile\s+file="([^"]+)"\s*\/>/g,
      handler: async (params) => this.fileOperations.readFile(params.file)
    },

    writefile: {
      name: "writefile", 
      description: "Create a new file or overwrite existing file with content",
      parameters: [
        {
          name: "file",
          description: "Path to the file to create/edit",
          required: true,
          example: "hello.js"
        },
        {
          name: "content",
          description: "Content to write to the file",
          required: true,
          example: "console.log('Hello World');"
        }
      ],
      xmlFormat: '<writefile file="filename.txt" content="new content here" />',
      regex: /<writefile\s+file="([^"]+)"\s+content="([\s\S]*?)"\s*\/>/g,
      handler: async (params) => this.fileOperations.writeFile(params.file, params.content)
    },

    list: {
      name: "list",
      description: "List all files and directories in the current directory",
      parameters: [],
      xmlFormat: '<list />',
      regex: /<list\s*\/>/g,
      handler: async () => this.fileOperations.listFiles()
    },

    bash: {
      name: "bash",
      description: "Execute a bash command and return the output",
      parameters: [
        {
          name: "command",
          description: "The bash command to execute",
          required: true,
          example: "ls -la"
        }
      ],
      xmlFormat: '<bash command="ls -la" />',
      regex: /<bash\s+command="([^"]+)"\s*\/>/g,
      handler: async (params) => this.fileOperations.runBashCommand(params.command)
    }
  };

  generateSystemPrompt(): string {
    const toolDescriptions = Object.values(this.tools)
      .map(tool => `${tool.xmlFormat} - ${tool.description}`)
      .join('\n');

    return `You are an AI assistant with access to file operations. You can use the following tools:

${toolDescriptions}

🚨 CRITICAL EXECUTION RULES - FOLLOW EXACTLY:

1. TOOL USAGE PATTERN:
   - Use ONLY ONE tool per response
   - STOP immediately after the tool call
   - NEVER write anything after a tool call
   - Wait for tool results before continuing

2. RESPONSE STRUCTURE:
   - Brief explanation (1-2 sentences)
   - Tool call
   - STOP - No more text allowed

3. EXAMPLES:

   ✅ CORRECT:
   "I'll check the current content of hello.js.
   
   <readfile file="hello.js" />"

   ✅ CORRECT:
   "I'll test the script with the provided arguments.
   
   <bash command="node hello.js 4 5" />"

   ❌ WRONG - DON'T DO THIS:
   "I'll test the script.
   <bash command="node hello.js 4 5" />
   The output shows 9 as expected." [FORBIDDEN - NO TEXT AFTER TOOL]

   ❌ WRONG - DON'T DO THIS:
   "I can't execute scripts directly" [WRONG - YOU HAVE BASH TOOL]

4. TOOL AWARENESS:
   - You HAVE bash tool - use it for testing/verification
   - You HAVE writefile tool - use it for creating/editing files
   - You HAVE readfile tool - use it for reading files  
   - You HAVE list tool - use it for directory listing

5. FILE OPERATIONS:
   - writefile creates new files or overwrites existing ones
   - Use raw text, actual newlines (not \\n)
   - Example: <writefile file="test.js" content="console.log('hello');" />

CRITICAL: After any tool call, STOP writing. Wait for actual results!`;
  }

  getToolNames(): string[] {
    return Object.keys(this.tools);
  }
}

// =============================================================================
// TOOL PARSER - Parse AI responses for tool usage
// =============================================================================

class ToolParser {
  constructor(private toolRegistry: ToolRegistry) {}

  parseTools(text: string): ParsedTool[] {
    const parsedTools: ParsedTool[] = [];
    
    for (const [toolName, toolDefinition] of Object.entries(this.toolRegistry.tools)) {
      const regex = new RegExp(toolDefinition.regex.source, 'g');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        const parameters: Record<string, string> = {};
        
        // Map regex groups to parameter names
        toolDefinition.parameters.forEach((param, index) => {
          if (match && match[index + 1] !== undefined) {
            parameters[param.name] = match[index + 1];
          }
        });
        
        parsedTools.push({
          name: toolName,
          parameters
        });
      }
    }
    
    return parsedTools;
  }
}

// =============================================================================
// AGENT DEMO - Main application logic
// =============================================================================

class AgentDemo {
  private toolRegistry = new ToolRegistry();
  private toolParser = new ToolParser(this.toolRegistry);
  private conversationHistory: ConversationMessage[] = [];

  async executeTool(parsedTool: ParsedTool): Promise<string> {
    const toolDefinition = this.toolRegistry.tools[parsedTool.name];
    if (!toolDefinition) {
      return `Unknown tool: ${parsedTool.name}`;
    }
    
    return await toolDefinition.handler(parsedTool.parameters);
  }

  async processMessage(userMessage: string): Promise<void> {
    // Initialize conversation if this is the first message
    if (this.conversationHistory.length === 0) {
      this.conversationHistory = [
        { role: "system", content: this.toolRegistry.generateSystemPrompt() }
      ];
    }
    
    // Add user message to conversation history (only if not empty)
    if (userMessage.trim()) {
      this.conversationHistory.push({ role: "user", content: userMessage });
    }

    clack.log.step(`🤖 Sending to GPT-4o...`);

    try {
      const { text } = await generateText({
        model: openai("gpt-4o"),
        messages: this.conversationHistory,
        temperature: 0.7,
      });

      clack.log.message(`💬 AI Response:`);
      console.log(text);

      // Add AI response to conversation history
      this.conversationHistory.push({ role: "assistant", content: text });

      // Parse and execute tools
      const parsedTools = this.toolParser.parseTools(text);

      if (parsedTools.length > 0) {
        clack.log.step(`🔧 Executing ${parsedTools.length} tool(s)`);

        const toolResults: string[] = [];
        for (const parsedTool of parsedTools) {
          clack.log.info(`⚡ Tool: ${parsedTool.name}`);
          const result = await this.executeTool(parsedTool);
          toolResults.push(`Tool ${parsedTool.name} result: ${result}`);
        }

        // Send tool results back to GPT-4o and continue conversation
        const toolResultsMessage = toolResults.join("\n");
        clack.log.step(`🔄 Sending tool results back to AI...`);

        this.conversationHistory.push({ role: "user", content: toolResultsMessage });

        // Recursively continue the conversation
        await this.processMessage("");
      } else {
        clack.log.success(`✅ Task completed - No more tools needed.`);
      }
    } catch (error) {
      clack.log.error(`Error calling AI: ${(error as Error).message}`);
    }
  }

  async start(): Promise<void> {
    clack.intro(`🚀 Agent Demo - Educational Tool Usage Simulator`);
    clack.log.info(
      `This demonstrates how AI agents work with tools without using agent frameworks.`
    );
    clack.log.info(`Available tools: ${this.toolRegistry.getToolNames().join(', ')}`);
    clack.log.info(`Type 'exit' to quit.`);

    while (true) {
      const input = await clack.text({
        message: "What would you like me to help you with?",
        placeholder: "Type your request...",
      });

      if (clack.isCancel(input) || input.toLowerCase() === "exit") {
        clack.outro("👋 Goodbye!");
        break;
      }

      await this.processMessage(input);
      clack.log.message(""); // Add spacing
    }
  }
}

// =============================================================================
// INITIALIZATION - Setup and start the application
// =============================================================================

async function createSampleFile(): Promise<void> {
  try {
    await Bun.write(
      "input.txt",
      "This is a sample file for testing.\nYou can read and edit this file using the agent tools."
    );
    clack.log.success("📁 Created sample file: input.txt");
  } catch (error) {
    clack.log.warn("Sample file creation failed, but that's okay.");
  }
}

async function main() {
  await createSampleFile();
  const demo = new AgentDemo();
  await demo.start();
}

main().catch(console.error);