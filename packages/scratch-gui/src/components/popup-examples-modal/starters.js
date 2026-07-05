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
import thumbSolar from './starters/popup-example-10.png';
import thumbGems from './starters/popup-example-11.png';
import thumbCarousel from './starters/popup-example-12.png';
import thumbPlatformRun from './starters/popup-example-13.png';

import sb3Card from './starters/popup-example-1.sb3';
import sb3Fish from './starters/popup-example-2.sb3';
import sb3Forest from './starters/popup-example-3.sb3';
import sb3Space from './starters/popup-example-4.sb3';
import sb3Jump from './starters/popup-example-5.sb3';
import sb3Garden from './starters/popup-example-6.sb3';
import sb3Platformer from './starters/popup-example-7.sb3';
import sb3Birthday from './starters/popup-example-8.sb3';
import sb3Crystal from './starters/popup-example-9.sb3';
import sb3Solar from './starters/popup-example-10.sb3';
import sb3Gems from './starters/popup-example-11.sb3';
import sb3Carousel from './starters/popup-example-12.sb3';
import sb3PlatformRun from './starters/popup-example-13.sb3';

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
        description: 'Real fish glide through a reef of coral and kelp, wandering gently ' +
            'and turning with a quick spin at the edges. Drag to look around.',
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
        description: 'Climb a tower of floating platforms to the flag at the top. Arrows ' +
            'walk and step in/out, space jumps, and the camera follows you up. Reach the ' +
            'goal to win!',
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
    },
    {
        id: 'solar-system',
        title: 'Solar System',
        description: 'Planets orbit the sun at their own speeds and depths while the ' +
            'camera circles the whole system.',
        thumbnail: thumbSolar,
        sb3: sb3Solar
    },
    {
        id: 'gem-hunt',
        title: 'Gem Hunt',
        description: 'A game: roam with the arrow keys (in, out and across) and collect ' +
            'all five gems hidden at different depths.',
        thumbnail: thumbGems,
        sb3: sb3Gems
    },
    {
        id: 'carousel',
        title: 'Carousel',
        description: 'Six horses are spaced evenly around a striped big top and revolve ' +
            'as they bob up and down — all with the orbit block.',
        thumbnail: thumbCarousel,
        sb3: sb3Carousel
    },
    {
        id: 'platform-run',
        title: 'Platform Run',
        description: 'Run up a climbing trail of tiles that zigzags left and right, far ' +
            'beyond the stage, with the camera over your shoulder. Up runs, left/right ' +
            'sidestep, space jumps. Reach the flag to win!',
        thumbnail: thumbPlatformRun,
        sb3: sb3PlatformRun
    }
];

export default starters;
