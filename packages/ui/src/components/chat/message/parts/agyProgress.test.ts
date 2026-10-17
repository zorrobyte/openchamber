import { describe, expect, test } from 'bun:test';

import type { AssistantMessage, Part, ReasoningPart } from '@/lib/opencode/model';
import { projectTurnActivity } from '../../lib/turns/projectTurnActivity';
import { filterVisibleParts } from '../partUtils';
import { expandAgyProgress, splitAgyReasoning, withAgyProgress } from './agyProgress';

const reasoning = (text: string): ReasoningPart => ({
    id: 'prt_1',
    sessionID: 'ses_1',
    messageID: 'msg_1',
    type: 'reasoning',
    text,
    time: { start: 1000 },
});

describe('agy progress rows', () => {
    test('turns step lines into read and shell rows and keeps the rest as reasoning', () => {
        const parts = splitAgyReasoning(reasoning('\n▸ view_file /repo/a.cs\n▸ run_command grep -rn Guest src\nComparing the two files.\n✗ write_to_file was refused\n'));
        expect(parts.map((part) => part.type)).toEqual(['tool', 'tool', 'reasoning']);
        const [read, shell, rest] = parts;
        expect(read).toMatchObject({ id: 'prt_1-agy-0', tool: 'read', executed: false, state: { status: 'completed', input: { filePath: '/repo/a.cs' } } });
        expect(shell).toMatchObject({ id: 'prt_1-agy-1', tool: 'shell', state: { input: { command: 'grep -rn Guest src' } } });
        expect(rest).toMatchObject({ type: 'reasoning', text: 'Comparing the two files.\n✗ write_to_file was refused' });
    });

    test('names an unmapped agy tool as itself, and drops reasoning that was only steps', () => {
        const parts = splitAgyReasoning(reasoning('▸ write_to_file /repo/b.cs'));
        expect(parts).toHaveLength(1);
        expect(parts[0]).toMatchObject({ type: 'tool', tool: 'write_to_file', state: { input: { target: '/repo/b.cs' } } });
    });

    test('leaves reasoning without step lines, and other parts, untouched', () => {
        const plain = reasoning('Just thinking.');
        const text: Part = { id: 'prt_2', sessionID: 'ses_1', messageID: 'msg_1', type: 'text', text: 'Answer' };
        const expanded = expandAgyProgress([plain, text]);
        expect(expanded[0]).toBe(plain);
        expect(expanded[1]).toBe(text);
    });

    test('keeps row ids stable while the reasoning keeps streaming', () => {
        const first = splitAgyReasoning(reasoning('▸ view_file /a'));
        const later = splitAgyReasoning(reasoning('▸ view_file /a\n▸ view_file /b'));
        expect(later[0]?.id).toBe(first[0]?.id);
        expect(later.map((part) => part.id)).toEqual(['prt_1-agy-0', 'prt_1-agy-1']);
    });
});

const assistant = (providerID: string): AssistantMessage => ({
    id: 'msg_1',
    sessionID: 'ses_1',
    role: 'assistant',
    time: { created: 1000 },
    agent: 'general',
    providerID,
    modelID: 'gemini-3.8-flash-high',
});

describe('agy rows with reasoning hidden', () => {
    const parts: Part[] = [reasoning('▸ view_file /repo/a.cs\nweighing it up'), { id: 'prt_2', sessionID: 'ses_1', messageID: 'msg_1', type: 'text', text: 'AGREE' }];

    test('the rows survive the reasoning filter; the leftover thinking does not', () => {
        const shown = filterVisibleParts(withAgyProgress(assistant('agy'), parts), { includeReasoning: false });
        expect(shown.map((part) => part.type)).toEqual(['tool', 'text']);
    });

    test('other providers keep their reasoning as reasoning', () => {
        expect(withAgyProgress(assistant('deepseek'), parts)).toBe(parts);
    });

    test('the turn counts agy steps as tool activity', () => {
        const activity = projectTurnActivity({ turnId: 't1', assistantMessages: [{ info: assistant('agy'), parts }] });
        expect(activity.hasTools).toBe(true);
        expect(activity.activityParts.map((record) => record.kind)).toEqual(['tool', 'reasoning']);
    });
});
