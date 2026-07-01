// Example projects shown in the Songs welcome modal.
//
// Each `sb3` import resolves (via webpack's asset/resource rule) to a URL that is
// fetched and handed to vm.loadProject() when the card is clicked. The projects are
// hand-authored in the editor; their thumbnails are screenshots captured mid-play by
// test/playwright/songs-examples.spec.js (copied into starters/ from test-results/).

import thumbDance from './starters/songs-example-1.png';
import thumbComposition from './starters/songs-example-2.png';
import thumbGame from './starters/songs-example-3.png';

import sb3Dance from './starters/songs-example-1.sb3';
import sb3Composition from './starters/songs-example-2.sb3';
import sb3Game from './starters/songs-example-3.sb3';

const starters = [
    {
        id: 'dance-party',
        title: 'Dance Party',
        description: 'A crew of dancers moves in time to the beats and notes of the song.',
        thumbnail: thumbDance,
        sb3: sb3Dance
    },
    {
        id: 'composition',
        title: 'Composition',
        description: 'Click each instrument on stage to cue its track in and out and ' +
            'build up the mix.',
        thumbnail: thumbComposition,
        sb3: sb3Composition
    },
    {
        id: 'game',
        title: 'Gem Hunt',
        description: 'Roam and collect the gems. Each one you grab adds a layer to the ' +
            'music — collect them all for a victory finish.',
        thumbnail: thumbGame,
        sb3: sb3Game
    }
];

export default starters;
