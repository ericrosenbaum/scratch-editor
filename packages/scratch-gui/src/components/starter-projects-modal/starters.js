// Starter projects shown in the welcome modal for the Speech to Text and Q&A
// extensions. Modeled on the Hand Sensing modal's starters.js.
//
// Each `sb3` import resolves (via webpack's `asset/resource` rule) to a URL that
// is fetched and handed to vm.loadProject() when a card is clicked. Thumbnails
// are rendered from each project's stage.
//
// The .sb3 files are generated from scripts/generate-starter-projects.js — edit
// the project definitions there to change scripts/characters, then regenerate.
// See starters/README.md.

import magicWordsThumb from './starters/magic-words.png';
import mazeStarterThumb from './starters/maze-starter.png';
import echoParrotThumb from './starters/echo-parrot.png';
import scratchHelperThumb from './starters/scratch-helper.png';
import pongWithFaqThumb from './starters/pong-with-faq.png';
import spaceAdventureThumb from './starters/space-adventure.png';
import talkToTheAxolotlThumb from './starters/talk-to-the-axolotl.png';

import magicWordsSb3 from './starters/magic-words.sb3';
import mazeStarterSb3 from './starters/maze-starter.sb3';
import echoParrotSb3 from './starters/echo-parrot.sb3';
import scratchHelperSb3 from './starters/scratch-helper.sb3';
import pongWithFaqSb3 from './starters/pong-with-faq.sb3';
import spaceAdventureSb3 from './starters/space-adventure.sb3';
import talkToTheAxolotlSb3 from './starters/talk-to-the-axolotl.sb3';

// Group ids map to the labeled sections rendered by the modal.
const SPEECH = 'speech2text';
const QNA = 'qna';
const BOTH = 'both';

const starters = [
    {
        id: 'magic-words',
        title: 'Magic Words',
        description: 'Say a magic word to cast a spell on the wizard.',
        thumbnail: magicWordsThumb,
        sb3: magicWordsSb3,
        group: SPEECH
    },
    {
        id: 'maze-starter',
        title: 'Maze Starter',
        description: 'Use your voice to steer the ball through the maze to the goal.',
        thumbnail: mazeStarterThumb,
        sb3: mazeStarterSb3,
        group: SPEECH
    },
    {
        id: 'echo-parrot',
        title: 'Echo Parrot',
        description: 'Talk to the parrot and it repeats what you say.',
        thumbnail: echoParrotThumb,
        sb3: echoParrotSb3,
        group: SPEECH
    },
    {
        id: 'scratch-helper',
        title: 'Scratch Helper',
        description: 'Click the robot and ask a question about Scratch.',
        thumbnail: scratchHelperThumb,
        sb3: scratchHelperSb3,
        group: QNA
    },
    {
        id: 'pong-with-faq',
        title: 'Pong FAQ',
        description: 'Play Pong, then ask the game questions answered from its FAQ.',
        thumbnail: pongWithFaqThumb,
        sb3: pongWithFaqSb3,
        group: QNA
    },
    {
        id: 'space-adventure',
        title: 'Space Adventure',
        description: 'Explore a space station, shuttle, and the Moon by typing what to do.',
        thumbnail: spaceAdventureThumb,
        sb3: spaceAdventureSb3,
        group: QNA
    },
    {
        id: 'talk-to-the-axolotl',
        title: 'Talk to the Axolotl',
        description: 'Ask an axolotl questions out loud and it answers back in its own voice.',
        thumbnail: talkToTheAxolotlThumb,
        sb3: talkToTheAxolotlSb3,
        group: BOTH
    }
];

export {
    starters as default,
    SPEECH,
    QNA,
    BOTH
};
