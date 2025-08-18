import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const messages: any[] = [];

// Simple file operations
async function readFile(filename: string) {
  try {
    const file = Bun.file(filename);
    return await file.text();
  } catch (error: any) {
    return `Error reading ${filename}: ${error.message}`;
  }
}

async function writeFile(filename: string, content: string) {
  try {
    // Unescape content
    const unescapedContent = content
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, "\\");

    await Bun.write(filename, unescapedContent);
    return `File ${filename} written successfully`;
  } catch (error: any) {
    return `Error writing ${filename}: ${error.message}`;
  }
}

// Parse tools from AI response
function parseTools(text: string) {
  const tools: any[] = [];

  // Parse readfile
  const readMatches = text.matchAll(/<readfile file="([^"]+)"\s*\/>/g);
  for (const match of readMatches) {
    tools.push({ name: "readfile", params: { file: match[1] } });
  }

  // Parse writefile
  const writeMatches = text.matchAll(
    /<writefile file="([^"]+)" content="([\s\S]*?)"\s*\/>/g
  );
  for (const match of writeMatches) {
    tools.push({
      name: "writefile",
      params: { file: match[1], content: match[2] },
    });
  }

  return tools;
}

// Execute tool
async function executeTool(tool: any) {
  if (tool.name === "readfile") {
    return await readFile(tool.params.file);
  }
  if (tool.name === "writefile") {
    return await writeFile(tool.params.file, tool.params.content);
  }
  return "Unknown tool";
}

// Main agent function
async function runAgent(userMessage: string) {
  const systemPrompt = `You are an AI assistant with file tools:

<readfile file="filename.txt" /> - Read file contents
<writefile file="filename.txt" content="file content here" /> - Write to file

Rules:
- Use ONE tool per response
- Stop after tool call
- No text after tool`;

  // Add system prompt only once
  if (messages.length === 0) {
    messages.push({ role: "system", content: systemPrompt });
  }

  // Add user message
  messages.push({ role: "user", content: userMessage });

  // Get AI response
  const { text } = await generateText({
    model: openai("gpt-5"),
    messages: messages,
  });

  console.log("AI:", text);

  // Add AI response to history
  messages.push({ role: "assistant", content: text });

  // Execute tools and continue if tools were used
  const tools = parseTools(text);
  if (tools.length > 0) {
    for (const tool of tools) {
      console.log(`Executing ${tool.name}...`);
      const result = await executeTool(tool);
      console.log("Result:", result);

      // Add tool result to history
      messages.push({ role: "user", content: `Tool result: ${result}` });
    }

    // Continue with next AI response after tool execution
    await runAgentContinue();
  }
}

// Continue agent after tool execution
async function runAgentContinue() {
  // Get AI response
  const { text } = await generateText({
    model: openai("gpt-5"),
    messages: messages,
  });

  console.log("AI:", text);

  // Add AI response to history
  messages.push({ role: "assistant", content: text });

  // Execute tools and continue if tools were used
  const tools = parseTools(text);
  if (tools.length > 0) {
    for (const tool of tools) {
      console.log(`Executing ${tool.name}...`);
      const result = await executeTool(tool);
      console.log("Result:", result);

      // Add tool result to history
      messages.push({ role: "user", content: `Tool result: ${result}` });
    }

    // Recursively continue until no more tools
    await runAgentContinue();
  }
}

// Interactive loop
async function startAgent() {
  console.log("Agent started! Type 'exit' to quit.");

  while (true) {
    const userInput = prompt("You: ");

    if (userInput === "exit") {
      console.log("Goodbye!");
      break;
    }

    if (userInput) {
      await runAgent(userInput);
    }
  }
}

startAgent();
