import type { Part, ReasoningPart, ToolInput, ToolPart } from '@/lib/opencode/model';
import { OPENCODE_TOOLS } from '@/lib/opencode/tools';

/** Provider id the Antigravity CLI bridge (opencode-agy) registers. */
export const AGY_PROVIDER_ID = 'agy';

// agy runs its tools inside its own loop, so OpenCode never holds tool parts for
// them. The bridge reports each step as a "▸ <tool> <target>" line in the
// reasoning stream; those lines become read-only tool parts here so the steps
// draw as the same rows as any other agent's tool calls.
const STEP_LINE = /^▸ (\S+)(?: (.*))?$/;

const toToolPart = (part: ReasoningPart, index: number, agyTool: string, target: string): ToolPart => {
    const id = `${part.id}-agy-${index}`;
    const start = part.time?.start ?? 0;
    const [tool, input]: [string, ToolInput] = agyTool === 'view_file'
        ? [OPENCODE_TOOLS.read, { filePath: target }]
        : agyTool === 'run_command'
            ? [OPENCODE_TOOLS.shell, { command: target }]
            : [agyTool, { target }];
    return {
        id,
        sessionID: part.sessionID,
        messageID: part.messageID,
        type: 'tool',
        callID: id,
        tool,
        executed: false,
        state: { status: 'completed', input, output: '', time: { start, end: start } },
    };
};

/** One agy reasoning part as its step rows, followed by whatever reasoning text is left. */
export const splitAgyReasoning = (part: ReasoningPart): Part[] => {
    const steps: ToolPart[] = [];
    const rest: string[] = [];
    for (const line of part.text.split('\n')) {
        const match = STEP_LINE.exec(line.trim());
        if (match) steps.push(toToolPart(part, steps.length, match[1], match[2] ?? ''));
        else rest.push(line);
    }
    if (steps.length === 0) return [part];
    const text = rest.join('\n').trim();
    return text ? [...steps, { ...part, text }] : steps;
};

export const expandAgyProgress = (parts: Part[]): Part[] =>
    parts.flatMap((part) => (part.type === 'reasoning' ? splitAgyReasoning(part) : [part]));
