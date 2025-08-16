import { openai } from "@ai-sdk/openai";
import * as clack from "@clack/prompts";
import { generateText } from "ai";

const SYSTEM_PROMPT = `You are an AI assistant with access to file operations. You can use the following tools when needed:

<readfile file="filename.txt" />
<editfile file="filename.txt" content="new content here" />
<list />

IMPORTANT: When you need to use these tools, output them EXACTLY as shown above within your response. You can use multiple tools in a single response if needed.

Always be helpful and use the tools when the user asks you to read, modify, or list files.`;

interface Tool {
  type: "readfile" | "editfile" | "list";
  file?: string;
  content?: string;
}

class AgentDemo {
  async readFile(filename: string): Promise<string> {
    try {
      const file = Bun.file(filename);
      const content = await file.text();
      clack.log.step(`📖 Reading file: ${filename}`);
      clack.log.info(
        `Content: ${content.slice(0, 200)}${content.length > 200 ? "..." : ""}`
      );
      return content;
    } catch (error) {
      clack.log.error(
        `Could not read file ${filename}: ${(error as Error).message}`
      );
      return `Error: Could not read file ${filename}`;
    }
  }

  async editFile(filename: string, content: string): Promise<string> {
    try {
      // Decode HTML entities and escaped quotes
      const decodedContent = content
        .replace(/&quot;/g, '"')
        .replace(/\\"/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      
      await Bun.write(filename, decodedContent);
      clack.log.step(`✏️ Edited file: ${filename}`);
      clack.log.info(
        `New content: ${decodedContent.slice(0, 200)}${
          decodedContent.length > 200 ? "..." : ""
        }`
      );
      return `Successfully wrote to ${filename}`;
    } catch (error) {
      clack.log.error(
        `Could not write to file ${filename}: ${(error as Error).message}`
      );
      return `Error: Could not write to file ${filename}`;
    }
  }

  async listFiles(): Promise<string> {
    try {
      const files = await Array.fromAsync(new Bun.Glob("*").scan("."));
      const dirs = await Array.fromAsync(new Bun.Glob("*/").scan("."));

      clack.log.step(`📂 Listing current directory contents`);

      // Combine and sort all entries like ls would do
      const allEntries = [...dirs, ...files].sort();

      clack.log.info(`Contents: ${allEntries.join(" ")}`);

      // Return raw listing like ls command
      return allEntries.join(" ");
    } catch (error) {
      clack.log.error(`Could not list directory: ${(error as Error).message}`);
      return `Error: Could not list directory`;
    }
  }

  parseTools(text: string): Tool[] {
    const tools: Tool[] = [];

    // Parse readfile tools
    const readfileRegex = /<readfile\s+file="([^"]+)"\s*\/>/g;
    let match;
    while ((match = readfileRegex.exec(text)) !== null) {
      tools.push({
        type: "readfile",
        file: match[1],
      });
    }

    // Parse editfile tools - handle multiline content
    const editfileRegex = /<editfile\s+file="([^"]+)"\s+content="([\s\S]*?)"\s*\/>/g;
    while ((match = editfileRegex.exec(text)) !== null) {
      tools.push({
        type: "editfile",
        file: match[1],
        content: match[2],
      });
    }

    // Parse list tools
    const listRegex = /<list\s*\/>/g;
    while ((match = listRegex.exec(text)) !== null) {
      tools.push({
        type: "list",
      });
    }

    return tools;
  }

  async executeTool(tool: Tool): Promise<string> {
    switch (tool.type) {
      case "readfile":
        return await this.readFile(tool.file!);
      case "editfile":
        return await this.editFile(tool.file!, tool.content!);
      case "list":
        return await this.listFiles();
      default:
        return `Unknown tool: ${tool.type}`;
    }
  }

  async processMessage(
    userMessage: string,
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = []
  ): Promise<void> {
    // Initialize conversation if this is the first message
    if (messages.length === 0) {
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ];
    }

    clack.log.step(`🤖 Sending to GPT-4o...`);

    try {
      const { text } = await generateText({
        model: openai("gpt-5"),
        messages,
        temperature: 0.7,
      });

      clack.log.message(`💬 AI Response:`);
      console.log(text);

      // Add AI response to conversation history
      messages.push({ role: "assistant", content: text });

      // Parse and execute tools
      const tools = this.parseTools(text);

      if (tools.length > 0) {
        clack.log.step(`🔧 Executing ${tools.length} tool(s)`);

        const toolResults: string[] = [];
        for (const tool of tools) {
          clack.log.info(`⚡ Tool: ${tool.type}`);
          const result = await this.executeTool(tool);
          toolResults.push(`Tool ${tool.type} result: ${result}`);
        }

        // Send tool results back to GPT-4o and continue conversation
        const toolResultsMessage = toolResults.join("\n");
        clack.log.step(`🔄 Sending tool results back to AI...`);

        messages.push({ role: "user", content: toolResultsMessage });

        // Recursively continue the conversation
        await this.processMessage("", messages);
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
    clack.log.info(`Available tools: readfile, editfile, list`);
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

// Create sample file for testing
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

// Start the demo
async function main() {
  await createSampleFile();
  const demo = new AgentDemo();
  await demo.start();
}

main().catch(console.error);
