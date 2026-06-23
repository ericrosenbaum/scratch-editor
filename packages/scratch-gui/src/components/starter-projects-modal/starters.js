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
import voiceRacerThumb from './starters/voice-racer.png';
import echoParrotThumb from './starters/echo-parrot.png';
import scratchHelperThumb from './starters/scratch-helper.png';
import dinoExpertThumb from './starters/dino-expert.png';
import meetTheCrewThumb from './starters/meet-the-crew.png';
import talkToTheRobotThumb from './starters/talk-to-the-robot.png';

import magicWordsSb3 from './starters/magic-words.sb3';
import voiceRacerSb3 from './starters/voice-racer.sb3';
import echoParrotSb3 from './starters/echo-parrot.sb3';
import scratchHelperSb3 from './starters/scratch-helper.sb3';
import dinoExpertSb3 from './starters/dino-expert.sb3';
import meetTheCrewSb3 from './starters/meet-the-crew.sb3';
import talkToTheRobotSb3 from './starters/talk-to-the-robot.sb3';

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
        id: 'voice-racer',
        title: 'Voice Racer',
        description: 'Say "go", "stop", and "jump" to drive to the finish.',
        thumbnail: voiceRacerThumb,
        sb3: voiceRacerSb3,
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
        id: 'dino-expert',
        title: 'Dino Expert',
        description: 'Ask the dinosaur facts — then add your own!',
        thumbnail: dinoExpertThumb,
        sb3: dinoExpertSb3,
        group: QNA
    },
    {
        id: 'meet-the-crew',
        title: 'Meet the Crew',
        description: 'Interview two experts, each with their own answers.',
        thumbnail: meetTheCrewThumb,
        sb3: meetTheCrewSb3,
        group: QNA
    },
    {
        id: 'talk-to-the-robot',
        title: 'Talk to the Robot',
        description: 'Ask a question out loud and the robot answers back.',
        thumbnail: talkToTheRobotThumb,
        sb3: talkToTheRobotSb3,
        group: BOTH
    }
];

export {
    starters as default,
    SPEECH,
    QNA,
    BOTH
};
