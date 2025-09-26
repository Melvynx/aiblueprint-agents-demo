import { openai } from "@ai-sdk/openai";
import { generateText, ModelMessage } from "ai";
import TurndownService from "turndown";
import tree from "tree-node-cli";

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

### Tools "webfetch"

This tool enable you to fetch a webpage, convert it to markdown, and get an AI summary based on a specific prompt.

Usage :
<webfetch url="https://example.com" prompt="Summarize the main points about AI" />

Params :
url : the URL of the webpage you want to fetch and analyze
prompt : the specific question or instruction for summarizing the content

### Tools "ls"

This tool enable you to list files and directories in a beautiful tree structure with configurable depth.

Usage :
<ls path="./src" depth="2" />
<ls path="." />
<ls />

Params :
path : the directory path to list (optional, defaults to current directory ".")
depth : the maximum depth of recursion (optional, defaults to 3)



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

async function webFetch(url: string, prompt: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    const turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '*',
      codeBlockStyle: 'fenced',
      linkStyle: 'inlined'
    });

    turndownService.remove(['script', 'style']);
    const markdown = turndownService.turndown(html);

    const { text: summary } = await generateText({
      model: openai("gpt-5"),
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes web content based on specific prompts. Provide concise, relevant information."
        },
        {
          role: "user",
          content: `Here is the content of a webpage in markdown format:\n\n${markdown}\n\nPlease respond to this request: ${prompt}`
        }
      ],
    });

    return {
      aiOutput: summary,
      userOutput: `🌐 Fetched and summarized content from ${new URL(url).hostname}`,
    };
  } catch (error) {
    const errorMsg = `Error fetching ${url}: ${error}`;
    return {
      aiOutput: errorMsg,
      userOutput: `❌ ${errorMsg}`,
    };
  }
}

async function listDirectory(path: string = ".", depth: number = 3) {
  try {
    if (depth < 1) depth = 1;
    if (depth > 10) depth = 10;

    const excludePatterns: RegExp[] = [/\.git$/];

    try {
      const gitignorePath = `${path}/.gitignore`;
      const gitignoreFile = Bun.file(gitignorePath);
      const gitignoreContent = await gitignoreFile.text();

      const patterns = gitignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(pattern => {
          let regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
            .replace(/\/$/, '');

          return new RegExp(regexPattern + '(/.*)?$');
        });

      excludePatterns.push(...patterns);
    } catch {
      // Si pas de .gitignore, on continue avec les exclusions par défaut
    }

    const treeString = tree(path, {
      allFiles: true,
      maxDepth: depth,
      dirsFirst: true,
      sizes: false,
      exclude: excludePatterns
    });

    const lines = treeString.split('\n').filter(line => line.trim()).length;

    return {
      aiOutput: treeString,
      userOutput: `📁 Listed ${path} (depth: ${depth}, ${lines} items)`,
    };
  } catch (error) {
    const errorMsg = `Error listing directory "${path}": ${error}`;
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

  if (tool.name === "webfetch") {
    return await webFetch(tool.params.url, tool.params.prompt);
  }

  if (tool.name === "ls") {
    return await listDirectory(tool.params.path, parseInt(tool.params.depth) || 3);
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

  const webfetchMatches = text.matchAll(
    /<webfetch url="([^"]+)"\s+prompt="((?:[^"\\]|\\.)*)"\s*\/>/g
  );

  for (const match of webfetchMatches) {
    tools.push({
      name: "webfetch",
      params: { url: match[1], prompt: match[2] },
    });
  }

  const lsMatches = text.matchAll(
    /<ls(?:\s+path="([^"]*)")?(?:\s+depth="([^"]*)")?\s*\/>/g
  );

  for (const match of lsMatches) {
    tools.push({
      name: "ls",
      params: {
        path: match[1] || ".",
        depth: match[2] || "3"
      },
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
