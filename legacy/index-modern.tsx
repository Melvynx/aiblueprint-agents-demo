import React, { useState, useEffect } from 'react';
import { render } from 'ink';
import { AgentDemoApp } from './ui-components.js';
import type { ToolCall, Message } from './ui-components.js';
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

// =============================================================================
// REUSE EXISTING TOOL SYSTEM (keeping the clean architecture)
// =============================================================================

// Import types and classes from the existing index.ts
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
// FILE OPERATIONS (same as before but with modern UI feedback)
// =============================================================================

class ModernFileOperations {
  private decodeHtmlEntities(content: string): string {
    return content
      .replace(/&quot;/g, '"')
      .replace(/\\"/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  async readFile(filename: string): Promise<string> {
    const file = Bun.file(filename);
    const content = await file.text();
    return content;
  }

  async writeFile(filename: string, content: string): Promise<string> {
    const decodedContent = this.decodeHtmlEntities(content);
    const fileExists = await Bun.file(filename).exists();
    
    await Bun.write(filename, decodedContent);
    return `Successfully ${fileExists ? "updated" : "created"} ${filename}`;
  }

  async listFiles(): Promise<string> {
    const files = await Array.fromAsync(new Bun.Glob("*").scan("."));
    const dirs = await Array.fromAsync(new Bun.Glob("*/").scan("."));
    return [...dirs, ...files].sort().join(" ");
  }

  async runBashCommand(command: string): Promise<string> {
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
  }
}

// =============================================================================
// MODERN AGENT DEMO WITH INK UI
// =============================================================================

const ModernAgentDemo: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileOperations = new ModernFileOperations();

  // Tool registry (simplified version)
  const tools: Record<string, ToolDefinition> = {
    readfile: {
      name: "readfile",
      description: "Read the contents of a file",
      parameters: [{ name: "file", description: "Path to file", required: true, example: "hello.js" }],
      xmlFormat: '<readfile file="filename.txt" />',
      regex: /<readfile\s+file="([^"]+)"\s*\/>/g,
      handler: async (params) => fileOperations.readFile(params.file)
    },
    writefile: {
      name: "writefile", 
      description: "Create or overwrite a file",
      parameters: [
        { name: "file", description: "Path to file", required: true, example: "hello.js" },
        { name: "content", description: "File content", required: true, example: "console.log('hello');" }
      ],
      xmlFormat: '<writefile file="filename.txt" content="content here" />',
      regex: /<writefile\s+file="([^"]+)"\s+content="([\s\S]*?)"\s*\/>/g,
      handler: async (params) => fileOperations.writeFile(params.file, params.content)
    },
    list: {
      name: "list",
      description: "List directory contents",
      parameters: [],
      xmlFormat: '<list />',
      regex: /<list\s*\/>/g,
      handler: async () => fileOperations.listFiles()
    },
    bash: {
      name: "bash",
      description: "Execute bash command",
      parameters: [{ name: "command", description: "Command to run", required: true, example: "ls -la" }],
      xmlFormat: '<bash command="ls -la" />',
      regex: /<bash\s+command="([^"]+)"\s*\/>/g,
      handler: async (params) => fileOperations.runBashCommand(params.command)
    }
  };

  const parseTools = (text: string): ParsedTool[] => {
    const parsedTools: ParsedTool[] = [];
    
    for (const [toolName, toolDefinition] of Object.entries(tools)) {
      const regex = new RegExp(toolDefinition.regex.source, 'g');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        const parameters: Record<string, string> = {};
        
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
  };

  const generateSystemPrompt = (): string => {
    const toolDescriptions = Object.values(tools)
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

CRITICAL: After any tool call, STOP writing. Wait for actual results!`;
  };

  const executeTool = async (toolCall: ToolCall, parsedTool: ParsedTool): Promise<string> => {
    // Update tool call status to processing
    setToolCalls(prev => prev.map(tc => 
      tc.id === toolCall.id ? { ...tc, status: 'processing' } : tc
    ));

    try {
      // Simulate realistic delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const toolDefinition = tools[parsedTool.name];
      const result = await toolDefinition.handler(parsedTool.parameters);
      
      // Update with success
      setToolCalls(prev => prev.map(tc => 
        tc.id === toolCall.id ? { 
          ...tc, 
          status: 'completed', 
          result,
          preview: formatToolResult(parsedTool.name, result)
        } : tc
      ));

      return result;
    } catch (error) {
      // Update with error
      setToolCalls(prev => prev.map(tc => 
        tc.id === toolCall.id ? { 
          ...tc, 
          status: 'failed', 
          result: (error as Error).message
        } : tc
      ));
      
      throw error;
    }
  };

  const formatToolResult = (toolName: string, result: string): string => {
    switch (toolName) {
      case 'readfile':
        return `📄 ${result.length} characters\n${result.slice(0, 200)}${result.length > 200 ? '...' : ''}`;
      case 'writefile':
        return `📝 File operation completed`;
      case 'list':
        return `📂 ${result.split(' ').length} items found\n${result}`;
      case 'bash':
        return `⚡ Exit code: 0\n${result.slice(0, 300)}${result.length > 300 ? '...' : ''}`;
      default:
        return result;
    }
  };

  const processMessage = async (userMessage: string): Promise<void> => {
    if (!userMessage.trim()) return;

    setIsProcessing(true);
    
    // Add user message
    const userMsg: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMsg]);

    // Initialize conversation if needed
    let newConversationHistory = [...conversationHistory];
    if (newConversationHistory.length === 0) {
      newConversationHistory = [{ role: "system", content: generateSystemPrompt() }];
    }
    newConversationHistory.push({ role: "user", content: userMessage });

    try {
      // Call AI
      const { text } = await generateText({
        model: openai("gpt-4o"),
        messages: newConversationHistory,
        temperature: 0.7,
      });

      // Add AI response
      const aiMsg: Message = {
        role: 'assistant',
        content: text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
      newConversationHistory.push({ role: "assistant", content: text });

      // Parse and execute tools
      const parsedTools = parseTools(text);
      
      if (parsedTools.length > 0) {
        const newToolCalls = parsedTools.map((parsedTool, index) => ({
          id: `${Date.now()}-${index}`,
          name: parsedTool.name,
          params: Object.entries(parsedTool.parameters)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' '),
          status: 'pending' as const
        }));

        setToolCalls(prev => [...prev, ...newToolCalls]);

        // Execute tools sequentially
        const toolResults: string[] = [];
        for (let i = 0; i < parsedTools.length; i++) {
          const result = await executeTool(newToolCalls[i], parsedTools[i]);
          toolResults.push(`Tool ${parsedTools[i].name} result: ${result}`);
        }

        // Continue conversation with tool results
        const toolResultsMessage = toolResults.join('\n');
        newConversationHistory.push({ role: "user", content: toolResultsMessage });
        
        // For now, just update conversation history
        // The recursive processing is handled in the original logic
      }

      setConversationHistory(newConversationHistory);
    } catch (error) {
      const errorMsg: Message = {
        role: 'system',
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserInput = (input: string) => {
    if (input.toLowerCase() === 'exit') {
      process.exit(0);
    }
    processMessage(input);
  };

  // Create sample file on startup
  useEffect(() => {
    const createSampleFile = async () => {
      try {
        await Bun.write("input.txt", "This is a sample file for testing.\nYou can read and edit this file using the agent tools.");
      } catch (error) {
        // Ignore error
      }
    };
    createSampleFile();
  }, []);

  return (
    <AgentDemoApp
      messages={messages}
      toolCalls={toolCalls}
      isProcessing={isProcessing}
      onUserInput={handleUserInput}
    />
  );
};

// Start the app
render(<ModernAgentDemo />);