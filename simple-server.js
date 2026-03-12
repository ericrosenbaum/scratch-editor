require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const {Project} = require('sb-edit');
const SYSTEM_PROMPT_MAP = require('./packages/scratch-gui/src/components/map-tab/system-prompt-map');

const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));

const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});

// OpenAI strict mode requires additionalProperties: false on all objects
const MAP_DATA_SCHEMA = {
    type: 'object',
    required: ['title', 'description', 'spriteOrder', 'groups', 'sprites'],
    additionalProperties: false,
    properties: {
        title: {type: 'string'},
        description: {type: 'string'},
        spriteOrder: {type: 'array', items: {type: 'string'}},
        groups: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'description', 'spriteNames'],
                additionalProperties: false,
                properties: {
                    name: {type: 'string'},
                    description: {type: 'string'},
                    spriteNames: {type: 'array', items: {type: 'string'}}
                }
            }
        },
        sprites: {
            type: 'array',
            items: {
                type: 'object',
                required: ['name', 'description', 'behaviors'],
                additionalProperties: false,
                properties: {
                    name: {type: 'string'},
                    description: {type: 'string'},
                    behaviors: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['event', 'description', 'details'],
                            additionalProperties: false,
                            properties: {
                                event: {type: 'string'},
                                description: {type: 'string'},
                                details: {type: 'array', items: {type: 'string'}}
                            }
                        }
                    }
                }
            }
        }
    }
};

async function projectJsonToText (projectJsonString) {
    const json = JSON.parse(projectJsonString);

    // Load the project via sb-edit; provide a no-op getAsset since we only need block/name info
    const project = await Project.fromSb3JSON(json, {
        getAsset: async () => new Uint8Array(0)
    });

    const scratchblocksMap = project.toScratchblocks();
    const targets = [...project.sprites, project.stage];

    // Preamble: list all sprite/stage names so the model knows exactly what to cover
    const allNames = targets.map(t => (t === project.stage ? 'Stage' : t.name));
    const lines = [
        `This project has ${allNames.length} sprites/targets. You MUST include every one of them in the sprites array of your output, with no exceptions:`,
        allNames.map((n, i) => `  ${i + 1}. ${n}`).join('\n'),
        ''
    ];

    for (const target of targets) {
        const name = target.name;
        const isStage = target === project.stage;
        lines.push(`=== ${isStage ? 'Stage' : `Sprite: ${name}`} ===`);

        const costumes = (target.costumes || []).map(c => c.name).join(', ');
        if (costumes) lines.push(`Costumes: ${costumes}`);

        const sounds = (target.sounds || []).map(s => s.name).join(', ');
        if (sounds) lines.push(`Sounds: ${sounds}`);

        const blocksText = scratchblocksMap[name] || scratchblocksMap[isStage ? 'Stage' : name];
        if (blocksText && blocksText.trim()) {
            lines.push('Scripts:');
            lines.push(blocksText.trim());
        } else {
            lines.push('(no scripts)');
        }

        lines.push('');
    }

    return lines.join('\n');
}

app.post('/api/generate-map', async (req, res) => {
    const {projectJson} = req.body;
    if (!projectJson) {
        return res.status(400).json({error: 'projectJson is required'});
    }

    try {
        const projectParsed = JSON.parse(projectJson);
        const allTargetNames = (projectParsed.targets || []).map(t => (t.isStage ? 'Stage' : t.name));

        const projectText = await projectJsonToText(projectJson);

        console.log('\n=== PROJECT TEXT INPUT ===');
        console.log(projectText);
        console.log(`=== END PROJECT TEXT (${projectText.length} chars) ===\n`);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            max_tokens: 16000,
            messages: [
                {role: 'system', content: SYSTEM_PROMPT_MAP},
                {role: 'user', content: projectText}
            ],
            response_format: {
                type: 'json_schema',
                json_schema: {
                    name: 'project_map',
                    strict: true,
                    schema: MAP_DATA_SCHEMA
                }
            }
        });

        const rawContent = response.choices[0].message.content;
        const finishReason = response.choices[0].finish_reason;
        console.log('\n=== GENERATED MAP JSON ===');
        console.log(rawContent);
        console.log(`=== END MAP JSON (${rawContent.length} chars, finish_reason=${finishReason}) ===\n`);

        if (finishReason === 'length') {
            console.error('WARNING: Response was truncated due to max_tokens limit!');
            return res.status(500).json({error: 'Response was truncated — project may be too large.'});
        }

        const mapData = JSON.parse(rawContent);

        // Warn about any sprites that the model omitted from the output
        const outputSpriteNames = new Set(mapData.sprites.map(s => s.name));
        const missingSprites = allTargetNames.filter(n => !outputSpriteNames.has(n));
        if (missingSprites.length > 0) {
            console.warn(`WARNING: ${missingSprites.length} sprites were omitted from the map:`, missingSprites);
        }

        // Apply spriteOrder: sort sprites, intra-group spriteNames, and groups themselves.
        // Sprites missing from spriteOrder sort to the end.
        const orderMap = new Map((mapData.spriteOrder || []).map((n, i) => [n, i]));
        const rank = name => (orderMap.has(name) ? orderMap.get(name) : Infinity);

        mapData.sprites.sort((a, b) => rank(a.name) - rank(b.name));

        for (const group of (mapData.groups || [])) {
            group.spriteNames.sort((a, b) => rank(a) - rank(b));
        }

        // Sanitize groups: remove any spriteNames that don't match an actual sprite,
        // and drop groups that end up empty after filtering.
        mapData.groups = (mapData.groups || [])
            .map(group => ({...group, spriteNames: group.spriteNames.filter(n => outputSpriteNames.has(n))}))
            .filter(group => group.spriteNames.length > 0);

        // Sort groups by the earliest-ranked sprite they contain (after sanitization).
        mapData.groups.sort((a, b) => {
            const aMin = Math.min(...a.spriteNames.map(rank));
            const bMin = Math.min(...b.spriteNames.map(rank));
            return aMin - bMin;
        });

        res.json({mapData});
    } catch (err) {
        console.error('Error generating map:', err);
        res.status(500).json({error: err.message});
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Map server running on http://localhost:${PORT}`);
});
