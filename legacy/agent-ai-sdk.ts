import { openai } from "@ai-sdk/openai";
import * as clack from "@clack/prompts";
import { generateText, tool } from "ai";
import { z } from "zod";

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
      clack.log.step(`🔧 ${toolName.toUpperCase()} ${params}`);
      
      spinner.start(`Processing...`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      const result = await operation();
      
      spinner.stop(`✅ Completed`);
      
      clack.log.info(previewResult(result));
      clack.log.message('');
      
      return result;
    } catch (error) {
      spinner.stop(`❌ Failed`);
      clack.log.error(`Error: ${(error as Error).message}`);
      clack.log.message('');
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
      throw new Error(`Could not read file ${filename}: ${(error as Error).message}`);
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
        (_result) => `${fileExists ? "📝 Updated" : "📄 Created"} ${decodedContent.length} characters\n   ${decodedContent.slice(0, 200)}${decodedContent.length > 200 ? "..." : ""}`,
        2200
      );

      return result;
    } catch (error) {
      throw new Error(`Could not write to file ${filename}: ${(error as Error).message}`);
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
        1800
      );

      return allEntries.join(" ");
    } catch (error) {
      throw new Error(`Could not list directory: ${(error as Error).message}`);
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
        2500
      );

      return result;
    } catch (error) {
      throw new Error(`Could not execute command: ${(error as Error).message}`);
    }
  }
}

// =============================================================================
// AI SDK TOOLS - Define tools using AI SDK tool() function with Zod
// =============================================================================

const fileOperations = new FileOperations();

export const readFileTool = tool({
  description: "Read the contents of a file",
  inputSchema: z.object({
    file: z.string().describe("Path to the file to read"),
  }),
  execute: async ({ file }: { file: string }) => {
    return await fileOperations.readFile(file);
  },
});

export const writeFileTool = tool({
  description: "Create a new file or overwrite existing file with content",
  inputSchema: z.object({
    file: z.string().describe("Path to the file to create/edit"),
    content: z.string().describe("Content to write to the file"),
  }),
  execute: async ({ file, content }: { file: string; content: string }) => {
    return await fileOperations.writeFile(file, content);
  },
});

export const listFilesTool = tool({
  description: "List all files and directories in the current directory",
  inputSchema: z.object({}),
  execute: async () => {
    return await fileOperations.listFiles();
  },
});

export const bashTool = tool({
  description: "Execute a bash command and return the output",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    return await fileOperations.runBashCommand(command);
  },
});

// =============================================================================
// AI SDK AGENT - Main agent using AI SDK's generateText with tools
// =============================================================================

export class AiSdkAgent {
  private tools = {
    readfile: readFileTool,
    writefile: writeFileTool,
    list: listFilesTool,
    bash: bashTool,
  };

  async processMessage(userMessage: string): Promise<void> {
    clack.log.step(`🤖 Sending to GPT-4o with AI SDK...`);

    try {
      const result = await generateText({
        model: openai("gpt-4o"),
        messages: [
          {
            role: "system",
            content: `You are an AI assistant with access to file operations. You can use the following tools:

- readfile: Read the contents of a file
- writefile: Create a new file or overwrite existing file with content  
- list: List all files and directories in the current directory
- bash: Execute a bash command and return the output

Be helpful and use tools when needed to assist the user.`
          },
          {
            role: "user", 
            content: userMessage
          }
        ],
        tools: this.tools,
        temperature: 0.7,
      });

      clack.log.message(`💬 AI Response:`);
      console.log(result.text);

      // Handle tool results if any were executed
      if (result.toolResults.length > 0) {
        clack.log.step(`🔧 Executed ${result.toolResults.length} tool(s)`);
        
        for (const toolResult of result.toolResults) {
          clack.log.info(`⚡ Tool: ${toolResult.toolName} - ${JSON.stringify(toolResult.output)}`);
        }
      }

      clack.log.success(`✅ Task completed.`);
    } catch (error) {
      clack.log.error(`Error calling AI: ${(error as Error).message}`);
    }
  }

  async start(): Promise<void> {
    clack.intro(`🚀 AI SDK Agent Demo - Modern Tool Usage`);
    clack.log.info(
      `This demonstrates the AI SDK with native tool support using Zod schemas.`
    );
    clack.log.info(`Available tools: ${Object.keys(this.tools).join(', ')}`);
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
      clack.log.message("");
    }
  }
}

// =============================================================================
// INITIALIZATION - Create and start the AI SDK agent
// =============================================================================

async function createSampleFile(): Promise<void> {
  try {
    await Bun.write(
      "input.txt",
      "This is a sample file for testing.\nYou can read and edit this file using the AI SDK agent tools."
    );
    clack.log.success("📁 Created sample file: input.txt");
  } catch (error) {
    clack.log.warn("Sample file creation failed, but that's okay.");
  }
}

async function main() {
  await createSampleFile();
  const agent = new AiSdkAgent();
  await agent.start();
}

if (require.main === module) {
  main().catch(console.error);
}