import { Box, Spacer, Text } from "ink";
import TextInput from "ink-text-input";
import React, { useEffect, useState } from "react";

// =============================================================================
// TYPES FOR UI COMPONENTS
// =============================================================================

interface ToolCall {
  id: string;
  name: string;
  params: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: string;
  preview?: string;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

// =============================================================================
// LOADING SPINNER COMPONENT
// =============================================================================

const Spinner: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 100);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return <Text color="cyan">{frames[frame]}</Text>;
};

// =============================================================================
// TOOL EXECUTION CARD COMPONENT
// =============================================================================

const ToolExecutionCard: React.FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const getStatusIcon = () => {
    switch (toolCall.status) {
      case "pending":
        return "⏳";
      case "processing":
        return <Spinner isVisible={true} />;
      case "completed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getStatusColor = () => {
    switch (toolCall.status) {
      case "completed":
        return "green";
      case "failed":
        return "red";
      case "processing":
        return "cyan";
      default:
        return "yellow";
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      padding={1}
      marginY={1}
    >
      <Box>
        <Text bold color="blue">
          🔧 {toolCall.name.toUpperCase()}
        </Text>
        <Spacer />
        <Text color={getStatusColor()}>{getStatusIcon()}</Text>
      </Box>

      {toolCall.params && (
        <Box marginLeft={2}>
          <Text color="gray">{toolCall.params}</Text>
        </Box>
      )}

      {toolCall.status === "processing" && (
        <Box marginLeft={2} marginTop={1}>
          <Spinner isVisible={true} />
          <Text color="cyan"> Processing...</Text>
        </Box>
      )}

      {toolCall.preview && toolCall.status === "completed" && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="green" bold>
            Result:
          </Text>
          <Box
            borderStyle="single"
            borderColor="green"
            padding={1}
            marginTop={1}
          >
            <Text>{toolCall.preview}</Text>
          </Box>
        </Box>
      )}

      {toolCall.status === "failed" && toolCall.result && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="red" bold>
            Error:
          </Text>
          <Box borderStyle="single" borderColor="red" padding={1} marginTop={1}>
            <Text color="red">{toolCall.result}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

// =============================================================================
// MESSAGE BUBBLE COMPONENT
// =============================================================================

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const getMessageStyle = () => {
    switch (message.role) {
      case "user":
        return { color: "blue", prefix: "💭 You:", borderColor: "blue" };
      case "assistant":
        return { color: "green", prefix: "🤖 AI:", borderColor: "green" };
      case "system":
        return { color: "gray", prefix: "⚙️ System:", borderColor: "gray" };
      default:
        return { color: "white", prefix: "•", borderColor: "white" };
    }
  };

  const style = getMessageStyle();

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color={style.color}>
          {style.prefix}
        </Text>
      </Box>
      <Box
        borderStyle="single"
        borderColor={style.borderColor}
        padding={1}
        marginLeft={2}
      >
        <Text>{message.content}</Text>
      </Box>
    </Box>
  );
};

// =============================================================================
// MAIN APP HEADER
// =============================================================================

const AppHeader: React.FC = () => (
  <Box flexDirection="column" marginBottom={2}>
    <Box
      justifyContent="center"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
    >
      <Text bold color="cyan">
        🚀 Agent Demo - Educational Tool Usage Simulator
      </Text>
    </Box>
    <Box justifyContent="center" marginTop={1}>
      <Text color="gray">
        Modern terminal interface demonstrating AI agents with tools • Type
        'exit' to quit
      </Text>
    </Box>
    <Box justifyContent="center">
      <Text color="yellow">
        Available tools: readfile, writefile, list, bash
      </Text>
    </Box>
  </Box>
);

// =============================================================================
// CONVERSATION CONTAINER
// =============================================================================

const ConversationContainer: React.FC<{
  messages: Message[];
  toolCalls: ToolCall[];
  isProcessing: boolean;
}> = ({ messages, toolCalls, isProcessing }) => (
  <Box flexDirection="column" flexGrow={1}>
    {messages.map((message, index) => (
      <MessageBubble key={index} message={message} />
    ))}

    {toolCalls.map((toolCall) => (
      <ToolExecutionCard key={toolCall.id} toolCall={toolCall} />
    ))}

    {isProcessing && (
      <Box marginY={1}>
        <Spinner isVisible={true} />
        <Text color="cyan"> AI is thinking...</Text>
      </Box>
    )}
  </Box>
);

// =============================================================================
// INPUT PROMPT COMPONENT
// =============================================================================

const InputPrompt: React.FC<{
  onSubmit: (input: string) => void;
  disabled: boolean;
}> = ({ onSubmit, disabled }) => {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSubmit(input.trim());
      setInput("");
    }
  };

  if (disabled) {
    return (
      <Box borderStyle="single" borderColor="gray" padding={1}>
        <Text color="gray">💭 AI is processing...</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderColor="blue" padding={1}>
      <Text color="blue">💭 You: </Text>
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        placeholder="Type your request..."
      />
    </Box>
  );
};

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

export const AgentDemoApp: React.FC<{
  messages: Message[];
  toolCalls: ToolCall[];
  isProcessing: boolean;
  onUserInput: (input: string) => void;
}> = ({ messages, toolCalls, isProcessing, onUserInput }) => {
  return (
    <Box flexDirection="column" height="100%">
      <AppHeader />

      <ConversationContainer
        messages={messages}
        toolCalls={toolCalls}
        isProcessing={isProcessing}
      />

      <InputPrompt onSubmit={onUserInput} disabled={isProcessing} />
    </Box>
  );
};

export type { Message, ToolCall };
