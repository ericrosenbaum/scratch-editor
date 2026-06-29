// Example projects shown in the 3D Pop-Up welcome modal.
//
// Each `sb3` import resolves (via webpack's asset/resource rule) to a URL that is
// fetched and handed to vm.loadProject() when the card is clicked. Thumbnails are
// rendered from each project's 3D view (see test/playwright/popup-examples.spec.js).

import thumbCard from './starters/popup-example-1.png';
import thumbFish from './starters/popup-example-2.png';
import thumbForest from './starters/popup-example-3.png';
import thumbSpace from './starters/popup-example-4.png';
import thumbJump from './starters/popup-example-5.png';
import thumbGarden from './starters/popup-example-6.png';
import thumbPlatformer from './starters/popup-example-7.png';
import thumbBirthday from './starters/popup-example-8.png';
import thumbCrystal from './starters/popup-example-9.png';

import sb3Card from './starters/popup-example-1.sb3';
import sb3Fish from './starters/popup-example-2.sb3';
import sb3Forest from './starters/popup-example-3.sb3';
import sb3Space from './starters/popup-example-4.sb3';
import sb3Jump from './starters/popup-example-5.sb3';
import sb3Garden from './starters/popup-example-6.sb3';
import sb3Platformer from './starters/popup-example-7.sb3';
import sb3Birthday from './starters/popup-example-8.sb3';
import sb3Crystal from './starters/popup-example-9.sb3';

const starters = [
    {
        id: 'pop-up-card',
        title: 'Pop-Up Card',
        description: 'A heart and a star stand up at different depths. Drag to spin it.',
        thumbnail: thumbCard,
        sb3: sb3Card
    },
    {
        id: 'fish-tank',
        title: 'Fish Tank',
        description: 'Fish swim at different depths while the camera slowly turns.',
        thumbnail: thumbFish,
        sb3: sb3Fish
    },
    {
        id: 'build-a-forest',
        title: 'Build a Forest',
        description: 'Stamp a whole row of 3D trees with the green flag.',
        thumbnail: thumbForest,
        sb3: sb3Forest
    },
    {
        id: 'space-flyer',
        title: 'Space Flyer',
        description: 'Fly a rocket through space with the arrow keys (left/right and into the screen).',
        thumbnail: thumbSpace,
        sb3: sb3Space
    },
    {
        id: 'jump',
        title: 'Jump!',
        description: 'Walk with the arrow keys and jump with the space bar.',
        thumbnail: thumbJump,
        sb3: sb3Jump
    },
    {
        id: 'magic-garden',
        title: 'Magic Garden',
        description: 'Move with the arrow keys and press space to plant 3D flowers.',
        thumbnail: thumbGarden,
        sb3: sb3Garden
    },
    {
        id: '3d-platformer',
        title: '3D Platformer',
        description: 'Hop between floating platforms with gravity. Arrows walk and step ' +
            'in/out; space jumps — line up in all three axes to land.',
        thumbnail: thumbPlatformer,
        sb3: sb3Platformer
    },
    {
        id: 'birthday-card',
        title: 'Birthday Card',
        description: 'A 3D greeting that sways and shifts colour. Click the balloons to ' +
            'pop them and click the cake to make a wish.',
        thumbnail: thumbBirthday,
        sb3: sb3Birthday
    },
    {
        id: '3d-crystal',
        title: '3D Crystal',
        description: 'Several flat gems are crossed and spun into one solid, faceted ' +
            'crystal — a 3D shape no single drawing could make. The camera orbits it.',
        thumbnail: thumbCrystal,
        sb3: sb3Crystal
    }
];

export default starters;
