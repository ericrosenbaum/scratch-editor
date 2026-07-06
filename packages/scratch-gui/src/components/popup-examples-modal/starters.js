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
import thumbRace from './starters/popup-example-14.png';
import thumbTown from './starters/popup-example-15.png';
import thumbRobot from './starters/popup-example-16.png';

// Short animated demos of each example, swapped in for the static thumbnail
// while the card is hovered.
import gifCard from './starters/popup-example-1.gif';
import gifFish from './starters/popup-example-2.gif';
import gifForest from './starters/popup-example-3.gif';
import gifSpace from './starters/popup-example-4.gif';
import gifJump from './starters/popup-example-5.gif';
import gifGarden from './starters/popup-example-6.gif';
import gifPlatformer from './starters/popup-example-7.gif';
import gifBirthday from './starters/popup-example-8.gif';
import gifCrystal from './starters/popup-example-9.gif';
import gifSolar from './starters/popup-example-10.gif';
import gifGems from './starters/popup-example-11.gif';
import gifCarousel from './starters/popup-example-12.gif';
import gifPlatformRun from './starters/popup-example-13.gif';
import gifRace from './starters/popup-example-14.gif';
import gifTown from './starters/popup-example-15.gif';
import gifRobot from './starters/popup-example-16.gif';

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
import sb3Race from './starters/popup-example-14.sb3';
import sb3Town from './starters/popup-example-15.sb3';
import sb3Robot from './starters/popup-example-16.sb3';

const starters = [
    {
        id: 'pop-up-card',
        title: 'Pop-Up Card',
        description: 'A heart and a star stand up at different depths. Drag to spin it.',
        thumbnail: thumbCard,
        animatedThumbnail: gifCard,
        sb3: sb3Card
    },
    {
        id: 'fish-tank',
        title: 'Fish Tank',
        description: 'Real fish glide through a reef of coral and kelp, wandering gently ' +
            'and turning with a quick spin at the edges. Drag to look around.',
        thumbnail: thumbFish,
        animatedThumbnail: gifFish,
        sb3: sb3Fish
    },
    {
        id: 'build-a-forest',
        title: 'Build a Forest',
        description: 'Stamp a whole row of 3D trees with the green flag.',
        thumbnail: thumbForest,
        animatedThumbnail: gifForest,
        sb3: sb3Forest
    },
    {
        id: 'space-flyer',
        title: 'Space Flyer',
        description: 'Fly a rocket through space with the arrow keys (left/right and into the screen).',
        thumbnail: thumbSpace,
        animatedThumbnail: gifSpace,
        sb3: sb3Space
    },
    {
        id: 'jump',
        title: 'Jump!',
        description: 'Walk with the arrow keys and jump with the space bar.',
        thumbnail: thumbJump,
        animatedThumbnail: gifJump,
        sb3: sb3Jump
    },
    {
        id: 'magic-garden',
        title: 'Magic Garden',
        description: 'Move with the arrow keys and press space to plant 3D flowers.',
        thumbnail: thumbGarden,
        animatedThumbnail: gifGarden,
        sb3: sb3Garden
    },
    {
        id: '3d-platformer',
        title: '3D Platformer',
        description: 'Climb a tower of floating platforms to the flag at the top. Arrows ' +
            'walk and step in/out, space jumps, and the camera follows you up. Reach the ' +
            'goal to win!',
        thumbnail: thumbPlatformer,
        animatedThumbnail: gifPlatformer,
        sb3: sb3Platformer
    },
    {
        id: 'birthday-card',
        title: 'Birthday Card',
        description: 'A 3D greeting that sways and shifts colour. Click the balloons to ' +
            'pop them and click the cake to make a wish.',
        thumbnail: thumbBirthday,
        animatedThumbnail: gifBirthday,
        sb3: sb3Birthday
    },
    {
        id: '3d-crystal',
        title: '3D Crystal',
        description: 'Several flat gems are crossed and spun into one solid, faceted ' +
            'crystal — a 3D shape no single drawing could make. The camera orbits it.',
        thumbnail: thumbCrystal,
        animatedThumbnail: gifCrystal,
        sb3: sb3Crystal
    },
    {
        id: 'solar-system',
        title: 'Solar System',
        description: 'Planets orbit the sun at their own speeds and depths while the ' +
            'camera circles the whole system.',
        thumbnail: thumbSolar,
        animatedThumbnail: gifSolar,
        sb3: sb3Solar
    },
    {
        id: 'gem-hunt',
        title: 'Gem Hunt',
        description: 'A game: roam with the arrow keys (in, out and across) and collect ' +
            'all five gems hidden at different depths.',
        thumbnail: thumbGems,
        animatedThumbnail: gifGems,
        sb3: sb3Gems
    },
    {
        id: 'carousel',
        title: 'Carousel',
        description: 'Six horses are spaced evenly around a striped big top and revolve ' +
            'as they bob up and down — all with the orbit block.',
        thumbnail: thumbCarousel,
        animatedThumbnail: gifCarousel,
        sb3: sb3Carousel
    },
    {
        id: 'platform-run',
        title: 'Platform Run',
        description: 'Run up a climbing trail of tiles that zigzags left and right, far ' +
            'beyond the stage, with the camera over your shoulder. Up runs, left/right ' +
            'sidestep, space jumps. Reach the flag to win!',
        thumbnail: thumbPlatformRun,
        animatedThumbnail: gifPlatformRun,
        sb3: sb3PlatformRun
    },
    {
        id: 'race-day',
        title: 'Race Day',
        description: 'Drive a lap around a giant racetrack, past trees and houses, from ' +
            'right behind the wheel. Up drives, left/right steer. Pass all four ' +
            'checkered gates to set your time!',
        thumbnail: thumbRace,
        animatedThumbnail: gifRace,
        sb3: sb3Race
    },
    {
        id: 'tiny-town',
        title: 'Tiny Town',
        description: 'Drop into a little town with a forest next door and see what you ' +
            'can find. Up walks, left/right turn. Bump into things — eight of them have ' +
            'something to say!',
        thumbnail: thumbTown,
        animatedThumbnail: gifTown,
        sb3: sb3Town
    },
    {
        id: 'robot-builder',
        title: 'Robot Builder',
        description: 'A robot built from six sprites with real joints: Q/A and P/L move ' +
            'the arms, arrow keys march the legs and nod the head, space jumps. Drag the ' +
            'stage to walk around it!',
        thumbnail: thumbRobot,
        animatedThumbnail: gifRobot,
        sb3: sb3Robot
    }
];

export default starters;
