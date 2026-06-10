// Optional Opus LLM-as-judge (behind --judge). Rates a candidate against the
// golden + prompt on a 0-100 rubric. Reported alongside the deterministic
// score; never folded into the committed regression anchor.
import {anthropicOpusProvider} from '../../../src/lib/song-ai/providers/anthropic.js';
import {songToCompactText} from '../lib/compact-notes.mjs';

const JUDGE_TOOL = {
    name: 'rate_music',
    description: 'Rate a candidate music generation against a reference.',
    input_schema: {
        type: 'object',
        properties: {
            musicality: {type: 'integer', description: '0-100: is it musically coherent and pleasant?'},
            promptAdherence: {type: 'integer', description: '0-100: does it satisfy the request?'},
            similarityToGolden: {type: 'integer', description: '0-100: comparable quality/intent to the reference?'},
            rationale: {type: 'string', description: 'One or two sentences.'}
        },
        required: ['musicality', 'promptAdherence', 'similarityToGolden', 'rationale']
    }
};

const SYSTEM = 'You are a strict but fair music-evaluation judge for a kids\' music-making tool. ' +
    'You will see a request, a strong reference ("golden"), and a candidate, each as compact ' +
    'note text (step:pitch:dur, or step:dN for drums). Rate the CANDIDATE on three 0-100 axes. ' +
    'Do not reward mere copying of the reference; reward musical sense and fit to the request. ' +
    'Call rate_music with your scores.';

export const judgeSample = async ({testCase, candidateView, goldenView, signal}) => {
    const userMessage = [
        `Request: ${testCase.prompt || '(structured edit)'}`,
        `Operation: ${testCase.operation}  Category: ${testCase.category}`,
        '',
        'GOLDEN (reference):',
        songToCompactText(goldenView),
        '',
        'CANDIDATE (to rate):',
        songToCompactText(candidateView)
    ].join('\n');
    try {
        const {toolInput} = await anthropicOpusProvider.callTool({
            systemPrompt: SYSTEM,
            userMessage,
            tool: JUDGE_TOOL,
            signal
        });
        if (!toolInput) return null;
        return {
            musicality: toolInput.musicality,
            promptAdherence: toolInput.promptAdherence,
            similarityToGolden: toolInput.similarityToGolden,
            rationale: toolInput.rationale
        };
    } catch (e) {
        return null;
    }
};
