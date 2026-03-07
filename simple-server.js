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
    required: ['title', 'description', 'sprites'],
    additionalProperties: false,
    properties: {
        title: {type: 'string'},
        description: {type: 'string'},
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
    const lines = [];

    for (const target of [...project.sprites, project.stage]) {
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
        const projectText = await projectJsonToText(projectJson);

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
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

        const content = response.choices[0].message.content;
        res.json({mapData: JSON.parse(content)});
    } catch (err) {
        console.error('Error generating map:', err);
        res.status(500).json({error: err.message});
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Map server running on http://localhost:${PORT}`);
});
