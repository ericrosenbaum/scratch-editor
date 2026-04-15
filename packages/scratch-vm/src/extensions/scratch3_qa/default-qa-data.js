/**
 * Default Q+A dataset shipped with the Q+A extension. Users can edit,
 * add to, or replace these from the GUI Edit QA Data modal.
 */
module.exports = [
    {
        name: 'scratch QA',
        pairs: [
            {
                question: 'what is Scratch?',
                answer:
                    'Scratch is a visual programming language where you snap blocks together ' +
                    'to make stories, games, and animations.'
            },
            {
                question: 'how do I make a sprite move?',
                answer:
                    'Drag a "move 10 steps" motion block into the scripts area and click it, ' +
                    'or attach it under a "when flag clicked" hat block.'
            },
            {
                question: 'how do I change costumes?',
                answer:
                    'Use the "switch costume to" block from the Looks category, ' +
                    'or "next costume" to cycle through them.'
            },
            {
                question: 'how do I play a sound?',
                answer:
                    'Pick a sound from the Sounds tab, then use the "play sound" block ' +
                    'from the Sound category in your script.'
            },
            {
                question: 'how do I save my project?',
                answer:
                    'Use the File menu at the top of the editor and choose "Save to your computer" ' +
                    'to download a .sb3 file.'
            }
        ]
    }
];
