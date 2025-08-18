import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import * as cheerio from "cheerio";
import { readdirSync } from "fs";

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

This tool enable you to search for text patterns in files.

Usage :
<grep pattern="search_pattern" file="filename.txt" />

Params :
pattern : the text pattern to search for
file : the file to search in

### Tools "ls"

This tool enable you to list files and directories in the current directory.

Usage :
<ls path="." />

Params :
path : the path to list (defaults to current directory "." if not specified)

### Tools "WebFetch"

This tool enable you to fetch a website content and parse it to markdown.

Usage :
<WebFetch url="https://example.com" />

Params :
url : the URL of the website to fetch

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

const messages: any[] = [
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
    console.log(`🔨 [${tool.name}] Result: ${result}`);

    messages.push({
      role: "user",
      content: `<tool name="${tool.name}" params="${JSON.stringify(
        tool.params
      )}">${result}</tool>`,
    });

    await runAgent();
  }
}

function readFile(filename: string) {
  try {
    const file = Bun.file(filename);
    return file.text();
  } catch (error) {
    return `Error reading ${filename}: ${error}`;
  }
}

function writeFile(filename: string, content: string) {
  try {
    const file = Bun.file(filename);
    file.write(
      content
        .replaceAll("\\n", "\n")
        .replaceAll("\\t", "\t")
        .replaceAll('\\"', '"')
    );
    return `File ${filename} written successfully. New content: ${content}`;
  } catch (error) {
    return `Error writing ${filename}: ${error}`;
  }
}

function getTweet(tweet_id: string) {
  return `Tweet ${tweet_id}: Hello je suis un super tweet de melvynxdev`;
}

function bash(command: string) {
  return Bun.spawnSync({ cmd: ["bash", "-c", command] }).stdout.toString();
}

async function grep(pattern: string, file: string) {
  try {
    const content = await readFile(file);
    if (content.includes(pattern)) {
      return `Pattern "${pattern}" found in ${file}.`;
    } else {
      return `Pattern "${pattern}" not found in ${file}.`;
    }
  } catch (error) {
    return `Error grepping ${file}: ${error}`;
  }
}

function ls(path: string = ".") {
  try {
    const entries = readdirSync(path);
    return `Contents of ${path}:\n${entries.join("\n")}`;
  } catch (error) {
    return `Error listing ${path}: ${error}`;
  }
}

async function webFetch(url: string) {
  try {
    console.log(`🌐 Fetching ${url}...`);
    const response = await fetch(url);
    const html = await response.text();
    // Use cheerio to parse and extract text, converting to simple markdown
    const $ = cheerio.load(html);

    function nodeToMarkdown(el: cheerio.Cheerio) {
      const tag = el[0].tagName ? el[0].tagName.toLowerCase() : "";
      const text = el
        .contents()
        .map((_, node) => {
          if (node.type === "text") return $(node).text();
          if (node.type === "tag") return nodeToMarkdown($(node));
          return "";
        })
        .get()
        .join("");

      switch (tag) {
        case "h1":
          return `# ${text}\n\n`;
        case "h2":
          return `## ${text}\n\n`;
        case "h3":
          return `### ${text}\n\n`;
        case "h4":
          return `#### ${text}\n\n`;
        case "h5":
          return `##### ${text}\n\n`;
        case "h6":
          return `###### ${text}\n\n`;
        case "p":
          return `${text}\n\n`;
        case "br":
          return `\n`;
        case "li":
          return `- ${text}\n`;
        case "a":
          return `[${text}](${el.attr("href") || ""})`;
        case "strong":
        case "b":
          return `**${text}**`;
        case "em":
        case "i":
          return `*${text}*`;
        case "code":
          return `\`${text}\``;
        case "pre":
          return `\`\`\`\n${text}\n\`\`\`\n`;
        case "ul":
        case "ol":
          return `${el
            .children()
            .map((_, c) => nodeToMarkdown($(c)))
            .get()
            .join("")}`;
        default:
          return text;
      }
    }

    // Prefer article or body
    const root = $("article").length ? $("article") : $("body");
    let markdown = root
      .children()
      .map((_, el) => nodeToMarkdown($(el)))
      .get()
      .join("\n")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim();

    const sizeKB = Math.round(html.length / 1024);
    console.log(`✅ Fetched ${sizeKB}KB from ${url}`);

    return `Content from ${url} (${sizeKB}KB):\n\n${markdown}`;
  } catch (error) {
    return `Error fetching ${url}: ${error}`;
  }
}

async function executeTool(tool: any) {
  if (tool.name === "readfile") {
    return readFile(tool.params.file);
  }

  if (tool.name === "writefile") {
    return writeFile(tool.params.file, tool.params.content);
  }

  if (tool.name === "bash") {
    return bash(tool.params.command);
  }

  if (tool.name === "get_tweet") {
    return getTweet(tool.params.tweet_id);
  }

  if (tool.name === "grep") {
    return await grep(tool.params.pattern, tool.params.file);
  }

  if (tool.name === "ls") {
    return ls(tool.params.path || ".");
  }

  if (tool.name === "WebFetch") {
    return await webFetch(tool.params.url);
  }

  return `Unknown tool: ${tool.name}`;
}

function parseTools(text: string) {
  const tools: any[] = [];

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
    /<grep pattern="([^"]+)"\s+file="([^"]+)"\s*\/>/g
  );

  for (const match of grepMatches) {
    tools.push({
      name: "grep",
      params: { pattern: match[1], file: match[2] },
    });
  }

  const lsMatches = text.matchAll(/<ls path="([^"]+)"\s*\/>/g);

  for (const match of lsMatches) {
    tools.push({
      name: "ls",
      params: { path: match[1] },
    });
  }

  const webFetchMatches = text.matchAll(/<WebFetch url="([^"]+)"\s*\/>/g);

  for (const match of webFetchMatches) {
    tools.push({
      name: "WebFetch",
      params: { url: match[1] },
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
