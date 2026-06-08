// Starter projects shown in the Hand Sensing welcome modal.
//
// Each entry's `sb3` import resolves (via webpack's asset/resource rule) to a URL
// that is fetched and handed to vm.loadProject() when the card is clicked.
// Thumbnails were rendered from each project's stage.

import thumb1 from './starters/hand-sensing-1.png';
import thumb2 from './starters/hand-sensing-2.png';
import thumb3 from './starters/hand-sensing-3.png';
import thumb4 from './starters/hand-sensing-4.png';
import thumb5 from './starters/hand-sensing-5.png';
import thumb6 from './starters/hand-sensing-6.png';

import sb3a from './starters/hand-sensing-1.sb3';
import sb3b from './starters/hand-sensing-2.sb3';
import sb3c from './starters/hand-sensing-3.sb3';
import sb3d from './starters/hand-sensing-4.sb3';
import sb3e from './starters/hand-sensing-5.sb3';
import sb3f from './starters/hand-sensing-6.sb3';

const starters = [
    {
        id: 'finger-paint',
        title: 'Finger Paint',
        description: 'Paint colorful lines by moving your fingertip in the air.',
        thumbnail: thumb1,
        sb3: sb3a
    },
    {
        id: 'finger-pong',
        title: 'Finger Pong',
        description: 'Bounce the ball by sliding your hand like a paddle.',
        thumbnail: thumb2,
        sb3: sb3b
    },
    {
        id: 'dress-up',
        title: 'Dress Up',
        description: 'Pinch and drag clothes to dress up the character.',
        thumbnail: thumb3,
        sb3: sb3c
    },
    {
        id: 'finger-rainbow',
        title: 'Finger Rainbow',
        description: 'Trail a rainbow everywhere your finger goes.',
        thumbnail: thumb4,
        sb3: sb3d
    },
    {
        id: 'flower-fingers',
        title: 'Flower Fingers',
        description: 'Sprout flowers from each of your fingertips.',
        thumbnail: thumb5,
        sb3: sb3e
    },
    {
        id: 'fire',
        title: 'Fire',
        description: 'Make flames with your fingertips.',
        thumbnail: thumb6,
        sb3: sb3f
    }
];

export default starters;
