// Default Q&A datasets for the Q&A extension.
// Each entry has a name, an array of {question, answer} pairs, and optional
// noMatchAnswer / noMatchThreshold controlling the "I don't know" fallback.

/* eslint-disable @stylistic/max-len */

module.exports = [
    {
        name: 'Scratch FAQ',
        // Answer used when no pair matches the question well enough, and the
        // minimum cosine similarity (0-1) the best match must reach to be used.
        noMatchAnswer: 'Hmm, I don\'t know the answer to that one!',
        noMatchThreshold: 0.55,
        pairs: [
            {
                question: 'What is Scratch?',
                answer: 'Scratch is a free coding platform where you can create games, animations, and stories by snapping together blocks.'
            },
            {
                question: 'Who made Scratch?',
                answer: 'Scratch was created by the Lifelong Kindergarten group at the MIT Media Lab.'
            },
            {
                question: 'Is Scratch free?',
                answer: 'Yes! Scratch is completely free to use. You can create an account and save your projects at scratch.mit.edu.'
            },
            {
                question: 'How do I make a sprite move?',
                answer: 'Use the "move 10 steps" block from the Motion category, or use arrow key events with move blocks inside them.'
            },
            {
                question: 'What is a sprite?',
                answer: 'A sprite is a character or object in your Scratch project. You can draw your own or choose one from the library.'
            },
            {
                question: 'What is a backdrop?',
                answer: 'A backdrop is the background image behind your sprites. You can change backdrops to create different scenes.'
            },
            {
                question: 'How do I make a sprite jump?',
                answer: 'Change the Y position upward quickly, then bring it back down. You can use "change y by 50" then "change y by -50" with a wait in between.'
            },
            {
                question: 'How do I make my sprite say something?',
                answer: 'Use the "say Hello!" block from the Looks category. You can change the text to anything you want!'
            },
            {
                question: 'How do I play a sound?',
                answer: 'Use the "play sound" block from the Sound category. You can record your own sounds or pick from the sound library.'
            },
            {
                question: 'What is a variable?',
                answer: 'A variable is like a box that stores a value, like a score or a player name. You can create variables in the Variables category.'
            },
            {
                question: 'How do I keep score?',
                answer: 'Create a variable called "score" and use "change score by 1" whenever the player does something good.'
            },
            {
                question: 'How do I make a game?',
                answer: 'Start with a sprite for your player, add movement with arrow keys, add obstacles or goals, and keep score with a variable!'
            },
            {
                question: 'What is a loop?',
                answer: 'A loop runs blocks over and over. The "forever" block loops forever, and "repeat 10" runs blocks 10 times.'
            },
            {
                question: 'How do I make something happen when I press a key?',
                answer: 'Use the "when [space] key pressed" block from the Events category. Click the key name to change which key triggers it.'
            },
            {
                question: 'How do I share my project?',
                answer: 'Save your project, then click "Share" to publish it on the Scratch website so everyone can see and play it!'
            }
        ]
    }
];
