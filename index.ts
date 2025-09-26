import { openai } from "@ai-sdk/openai";
import { generateText, ModelMessage } from "ai";

const systemPrompt = `You are a Coding Assistant named "MelvynCode" that SHOULD use the following tools when needed : 

## Tools

### Tools "readfile"

This tool enable you to read any file in the current directory.

Usage :
<readfile file="filename.txt" />

Params :
file : the path to the file you want to read

### Tools "writefile"

This tool enable you to write to any file in the current directory.

Usage :
<writefile file="filename.txt" content="new content here" />

Params :
file : the path to the file you want to write to. You always need to FIRST read the file before writing to it.
content : the content you want to write to the file, if you need to use " inside the content, please use \\"

### Tools "bash"

This tool enable you to run any bash command.

Usage :
<bash command="ls -la" />

Params :
command : the bash command you want to run

Important:
You don't run any HARMFUL command, like rm -rf /, etc.

### Tools "get_tweet"

This tool enable you to get a tweet from a user.

Usage :
<get_tweet tweet_id="1234567890" />

Params :
tweet_id : the id of the tweet you want to get

### Tools "grep"

This tool enable you to search for patterns in all files of a directory using grep -rnE.

Usage :
<grep pattern="search_term" />
<grep pattern="search_term" dir="folder_path" />

Params :
pattern : the text pattern you want to search for (supports extended regex with grep -rnE)
dir : the directory to search in (optional, defaults to current directory)

### Tools "glob"

This tool enable you to search for files by filename pattern using find command.

Usage :
<glob pattern="*.js" />
<glob pattern="test_*.py" dir="tests" />

Params :
pattern : the filename pattern you want to search for (supports wildcards like *, ?, [])
dir : the directory to search in (optional, defaults to current directory)



## Workflow

When the user ask you a question, you can decide between : 

* reply to the question
* use any tools, please reply with ONLY ONE TOOL USAGE.

In case you use a tools, you should ONLY return the tools usage.

## Examples

<bad-example>
<user>Add logs inside app.js</user>
<assistant>Ok, i will remove logs. ReadFile(app.js)</assistant>
</bad-example>

<good-example>
<user>Add logs inside app.js</user>
<assistant>ReadFile(app.js)</assistant>
</good-example>`;

const messages: Array<ModelMessage> = [
  {
    role: "system",
    content: systemPrompt,
  },
];

async function runAgent(userInput?: string) {
  if (userInput) {
    messages.push({ role: "user", content: userInput });
  }

  const { text } = await generateText({
    model: openai("gpt-5"),
    messages: messages,
  });

  console.log("AI:", text);

  const tools = parseTools(text);

  if (tools.length === 0) {
    return;
  }

  for (const tool of tools) {
    console.log(`🔨 [${tool.name}] Executing...`);
    const result = await executeTool(tool);

    // Display clean output to user
    console.log(`🔨 [${tool.name}] ${result.userOutput}`);

    // Send detailed output to AI
    messages.push({
      role: "user",
      content: `<tool name="${tool.name}" params="${JSON.stringify(
        tool.params
      )}">${result.aiOutput}</tool>`,
    });

    await runAgent();
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function readFile(filename: string) {
  try {
    const file = Bun.file(filename);
    const content = await file.text();
    const size = file.size;

    return {
      aiOutput: content,
      userOutput: `📄 ${filename} (${formatFileSize(size)})`,
    };
  } catch (error) {
    const errorMsg = `Error reading ${filename}: ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}

async function writeFile(filename: string, content: string) {
  try {
    const processedContent = content
      .replaceAll("\\n", "\n")
      .replaceAll("\\t", "\t")
      .replaceAll('\\"', '"');

    await Bun.write(filename, processedContent);
    const file = Bun.file(filename);
    const size = file.size;

    return {
      aiOutput: `File ${filename} written successfully. New content: ${processedContent}`,
      userOutput: `✅ ${filename} written (${formatFileSize(size)})`,
    };
  } catch (error) {
    const errorMsg = `Error writing ${filename}: ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}

function getTweet(tweet_id: string) {
  const content = `Tweet ${tweet_id}: Hello je suis un super tweet de melvynxdev`;
  return {
    aiOutput: content,
    userOutput: `🐦 Tweet ${tweet_id} retrieved`,
  };
}

function bash(command: string) {
  try {
    const result = Bun.spawnSync({ cmd: ["bash", "-c", command] });
    const output = result.stdout.toString();
    const lines = output.split("\n").filter((line) => line.trim()).length;

    return {
      aiOutput: output,
      userOutput: `⚡ ${command} (${lines} lines output)`,
    };
  } catch (error) {
    const errorMsg = `Error executing command: ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}

function grep(pattern: string, directory: string = ".") {
  try {
    const command = `cd ${directory} && git ls-files | xargs grep -nE "${pattern}" 2>/dev/null || echo "No matches found for pattern: ${pattern}"`;
    const result = Bun.spawnSync({ cmd: ["bash", "-c", command] })
      .stdout.toString()
      .trim();
    const output = result || `No matches found for pattern: ${pattern}`;
    const matches = result.includes("No matches found")
      ? 0
      : output.split("\n").filter((line) => line.trim()).length;

    return {
      aiOutput: output,
      userOutput: `🔍 Found ${matches} matches for "${pattern}" in ${directory}`,
    };
  } catch (error) {
    const errorMsg = `Error searching pattern "${pattern}": ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}

function glob(pattern: string, directory: string = ".") {
  try {
    const command = `cd ${directory} && find . -name "${pattern}" -type f 2>/dev/null | sed 's|^./||' | sort || echo "No files found matching pattern: ${pattern}"`;
    const result = Bun.spawnSync({ cmd: ["bash", "-c", command] })
      .stdout.toString()
      .trim();
    const output = result || `No files found matching pattern: ${pattern}`;
    const files = result.includes("No files found")
      ? 0
      : output.split("\n").filter((line) => line.trim()).length;

    return {
      aiOutput: output,
      userOutput: `📁 Found ${files} files matching "${pattern}" in ${directory}`,
    };
  } catch (error) {
    const errorMsg = `Error searching files with pattern "${pattern}": ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}



async function executeTool(tool: ToolType) {
  if (tool.name === "readfile") {
    return await readFile(tool.params.file);
  }

  if (tool.name === "writefile") {
    return await writeFile(tool.params.file, tool.params.content);
  }

  if (tool.name === "bash") {
    return bash(tool.params.command);
  }

  if (tool.name === "get_tweet") {
    return getTweet(tool.params.tweet_id);
  }

  if (tool.name === "grep") {
    return grep(tool.params.pattern, tool.params.dir);
  }

  if (tool.name === "glob") {
    return glob(tool.params.pattern, tool.params.dir);
  }


  const errorMsg = `Unknown tool: ${tool.name}`;
  return {
    aiOutput: errorMsg,
    userOutput: `❌ ${errorMsg}`,
  };
}

type ToolType = { name: string; params: Record<string, string> };

function parseTools(text: string) {
  const tools: { name: string; params: Record<string, string> }[] = [];

  const readMatches = text.matchAll(/<readfile file="([^"]+)"\s*\/>/g);

  for (const match of readMatches) {
    tools.push({ name: "readfile", params: { file: match[1] } });
  }

  // This regex supports \" inside the content attribute value
  const writeMatches = text.matchAll(
    /<writefile file="([^"]+)"\s+content="((?:[^"\\]|\\.)*)"\s*\/>/g
  );

  for (const match of writeMatches) {
    tools.push({
      name: "writefile",
      params: { file: match[1], content: match[2] },
    });
  }

  const bashMatches = text.matchAll(/<bash command="([^"]+)"\s*\/>/g);

  for (const match of bashMatches) {
    tools.push({
      name: "bash",
      params: { command: match[1] },
    });
  }

  const getTweetMatches = text.matchAll(/<get_tweet tweet_id="([^"]+)"\s*\/>/g);

  for (const match of getTweetMatches) {
    tools.push({
      name: "get_tweet",
      params: { tweet_id: match[1] },
    });
  }

  const grepMatches = text.matchAll(
    /<grep pattern="([^"]+)"(?:\s+dir="([^"]+)")?\s*\/>/g
  );

  for (const match of grepMatches) {
    tools.push({
      name: "grep",
      params: { pattern: match[1], dir: match[2] || "." },
    });
  }

  const globMatches = text.matchAll(
    /<glob pattern="([^"]+)"(?:\s+dir="([^"]+)")?\s*\/>/g
  );

  for (const match of globMatches) {
    tools.push({
      name: "glob",
      params: { pattern: match[1], dir: match[2] || "." },
    });
  }


  return tools;
}

async function startAgent() {
  console.log("Agent Started ! Type 'exit' to quit.");

  while (true) {
    const userInput = prompt("You:");

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
