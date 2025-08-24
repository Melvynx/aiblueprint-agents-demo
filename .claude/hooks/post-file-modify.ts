#!/usr/bin/env bun

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: {
    file_path: string;
    content: string;
  };
  tool_response: {
    filePath: string;
    success: boolean;
  };
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext: string;
  };
}

// Check for debug mode
const DEBUG = process.argv.includes("--debug");

function log(message: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(message, ...args);
  }
}

async function runCommand(
  command: string[]
): Promise<{ stdout: string; stderr: string; success: boolean }> {
  try {
    const proc = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const success = (await proc.exited) === 0;

    return { stdout, stderr, success };
  } catch (error) {
    return { stdout: "", stderr: String(error), success: false };
  }
}

async function main() {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  log("Hook started for file processing");

  // Lire l'input JSON depuis stdin
  const input = await Bun.stdin.text();
  log("Input received, length:", input.length);

  let hookData: HookInput;
  try {
    hookData = JSON.parse(input);
  } catch (error) {
    log("Error parsing JSON input:", error);
    process.exit(0);
  }

  const filePath = hookData.tool_input?.file_path;
  if (!filePath) {
    log("Unable to extract file path from input");
    process.exit(0);
  }

  // Vérifier que c'est un fichier .ts ou .tsx uniquement
  if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) {
    log(`Skipping ${filePath}: not a TypeScript file`);
    process.exit(0);
  }

  log("Processing file:", filePath);

  // Vérifier que le fichier existe
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    log("File not found:", filePath);
    process.exit(1);
  }

  // 1. Exécuter Prettier
  log("Running Prettier formatting");
  const prettierResult = await runCommand([
    "bun",
    "x",
    "prettier",
    "--write",
    filePath,
  ]);
  if (!prettierResult.success) {
    log("Prettier failed:", prettierResult.stderr);
  }

  // 2. ESLint --fix et récupération des erreurs restantes
  log("Running ESLint --fix and checking for remaining errors");
  await runCommand(["bun", "x", "eslint", "--fix", filePath]);

  // 3. ESLint check pour récupérer les erreurs restantes (après --fix)
  log("Checking remaining ESLint errors");
  const eslintCheckResult = await runCommand(["bun", "x", "eslint", filePath]);

  const eslintErrors = (
    eslintCheckResult.stdout + eslintCheckResult.stderr
  ).trim();

  // 3. Collecter les erreurs TypeScript
  log("Checking TypeScript errors");
  const tscResult = await runCommand([
    "bun",
    "x",
    "tsc",
    "--noEmit",
    "--pretty",
    "false",
  ]);
  const tsErrors = tscResult.stderr
    .split("\n")
    .filter((line) => line.includes(filePath))
    .join("\n");

  // Construire le message d'erreurs
  let errorMessage = "";

  if (tsErrors || eslintErrors) {
    errorMessage = `Fix NOW the following errors detected in ${filePath
      .split("/")
      .pop()}:\\n`;

    if (tsErrors) {
      errorMessage += `\\n TypeScript errors:\\n${tsErrors}\\n`;
    }

    if (eslintErrors) {
      errorMessage += `\\n ESLint errors:\\n${eslintErrors}\\n`;
    }
  }

  // Sortir le résultat
  if (errorMessage) {
    const output: HookOutput = {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: errorMessage,
      },
    };

    log(JSON.stringify(output, null, 2));
  } else {
    log(`No errors detected in ${filePath.split("/").pop()}`);
  }
}

main().catch((error) => {
  log("Error in hook:", error);
  process.exit(1);
});
