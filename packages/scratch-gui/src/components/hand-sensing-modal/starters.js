// Starter projects shown in the Hand Sensing welcome modal.
//
// PLACEHOLDER DATA: the thumbnails, titles, descriptions, and .sb3 files below
// are stand-ins. Replace the files in ./starters/ and the title/description text
// with the real starter projects when they are ready.
//
// Each entry's `sb3` import resolves (via webpack's asset/resource rule) to a URL
// that is fetched and handed to vm.loadProject() when the card is clicked.

import thumb1 from './starters/hand-sensing-1.png';
import thumb2 from './starters/hand-sensing-2.png';
import thumb3 from './starters/hand-sensing-3.png';

import sb3a from './starters/hand-sensing-1.sb3';
import sb3b from './starters/hand-sensing-2.sb3';
import sb3c from './starters/hand-sensing-3.sb3';

const starters = [
    {
        id: 'hand-sensing-1',
        title: 'Starter 1', // TODO: replace with real title
        description: 'A placeholder hand sensing starter project.', // TODO: replace
        thumbnail: thumb1,
        sb3: sb3a
    },
    {
        id: 'hand-sensing-2',
        title: 'Starter 2', // TODO: replace with real title
        description: 'A placeholder hand sensing starter project.', // TODO: replace
        thumbnail: thumb2,
        sb3: sb3b
    },
    {
        id: 'hand-sensing-3',
        title: 'Starter 3', // TODO: replace with real title
        description: 'A placeholder hand sensing starter project.', // TODO: replace
        thumbnail: thumb3,
        sb3: sb3c
    }
];

export default starters;
