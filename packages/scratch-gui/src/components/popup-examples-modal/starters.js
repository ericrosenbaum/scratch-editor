// Example projects shown in the 3D Pop-Up welcome modal.
//
// Each `sb3` import resolves (via webpack's asset/resource rule) to a URL that is
// fetched and handed to vm.loadProject() when the card is clicked. Thumbnails are
// rendered from each project's 3D view (see test/playwright/popup-examples.spec.js).

import thumbCard from './starters/popup-example-1.png';
import thumbFish from './starters/popup-example-2.png';
import thumbForest from './starters/popup-example-3.png';

import sb3Card from './starters/popup-example-1.sb3';
import sb3Fish from './starters/popup-example-2.sb3';
import sb3Forest from './starters/popup-example-3.sb3';

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
    }
];

export default starters;
