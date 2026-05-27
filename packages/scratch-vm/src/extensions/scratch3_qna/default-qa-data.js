// Default Q&A datasets for the Q&A extension.
// Each entry has a name and an array of {question, answer} pairs.

/* eslint-disable @stylistic/max-len */

module.exports = [
    {
        name: 'scratch QA',
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
    },
    {
        name: 'axolotl QA',
        pairs: [
            {question: 'Hello', answer: 'Hello!'},
            {question: 'How are you?', answer: "I'm feeling great."},
            {question: 'What are you?', answer: 'Well some call me a “Mexican walking fish,” but I\'m really a salamander.'},
            {question: 'What are those things on your head?', answer: 'Those fluffy frills are my external gills, and I wave them in the water to pull in oxygen so I can breathe.'},
            {question: 'Why do you look so cute?', answer: 'I keep my “baby” features like my gills and finny tail for my whole life.'},
            {question: 'Where does your name come from?', answer: 'My name, Axolotl, comes from the Aztec god Xólotl, and it\'s pronounced “ACK-suh-lot-ul.”'},
            {question: "What's your favorite movie?", answer: 'Hmm, maybe the Minecraft movie.'},
            {question: "What's your favorite video game?", answer: 'My favorite video game is Minecraft, of course.'},
            {question: 'Where do you live?', answer: 'I like to live in lakes and wetlands.'},
            {question: 'Are there a lot of axolotls?', answer: 'Sadly, we are nearly extinct in the wild.'},
            {question: 'What do you eat?', answer: 'I love to eat worms, shrimp and tiny fish.'},
            {question: 'Can you eat human food?', answer: 'Eating human junk food or other snacks would just make me sick.'},
            {question: 'Can you regrow body parts?', answer: 'If I lose a leg or part of my tail, I can regrow it!'},
            {question: 'How long do you live?', answer: 'If humans take good care of me in a nice tank, I can live for about 10 to 15 years.'},
            {question: 'What color are axolotls?', answer: 'Axolotls can naturally be dark brown, speckled, golden, or pink-white.'},
            {question: 'Can axolotls be other colors?', answer: 'Genetic variations can make us pink, black, or even dark blue.'},
            {question: 'What are you afraid of?', answer: 'In the wild, the scariest things for me are invasive fish that eat our eggs, and dirty, polluted water.'},
            {question: 'Can you hear?', answer: 'I can sense vibrations and some low sounds through the water, but I prefer quiet.'},
            {question: 'Do you like light?', answer: 'Because my eyes are sensitive, I like my world dim with lots of shady hiding places.'},
            {question: 'What would you ask kids?', answer: 'I\'d ask, “Why do humans change so much of the water and land around you, and can you help make it safe for tiny creatures like me again?”'},
            {question: 'What do you like in your tank?', answer: 'In my tank, I love caves, driftwood, smooth rocks, and plants.'},
            {question: "I don't know what to ask", answer: "I don't know!"}
        ]
    },
    {
        name: 'B animals QA',
        pairs: [
            {question: 'flies at night, uses echolocation, hangs upside down', answer: 'Bat'},
            {question: 'big furry animal, hibernates, lives in forests', answer: 'Bear'},
            {question: 'small insect with a hard shell, six legs', answer: 'Beetle'},
            {question: 'colorful wings, flies from flower to flower, caterpillar', answer: 'Butterfly'},
            {question: "I don't know", answer: "I don't know"}
        ]
    },
    {
        name: 'station QA',
        pairs: [
            {question: 'look around', answer: 'You look around the space station. You see windows, science equipment, and a transport shuttle.'},
            {question: 'look out the window', answer: 'You look out the window and see the Earth below, with blue oceans, white clouds, and land.'},
            {question: 'use the science equipment', answer: 'You press some buttons on the science equipment and lights blink, but nothing else happens.'},
            {question: 'what is my mission', answer: 'Your mission is to go someplace else, collect a rock sample, and bring it back here.'},
            {question: 'float around', answer: 'You float around, do some flips, and bounce off the walls. Microgravity is fun!'},
            {question: 'eat something', answer: "Hmm, looks like there's some astronaut ice cream. Yum."},
            {question: 'use the bathroom', answer: 'Yup they have a bathroom here on the space station.'},
            {question: 'use the shuttle', answer: 'You open the door to the shuttle and climb in.'},
            {question: 'help', answer: 'I don\'t know how to do that. Try "look around", "look out the window", or "use the shuttle".'}
        ]
    },
    {
        name: 'moon QA',
        pairs: [
            {question: 'look around', answer: 'You look around the Moon base. The gray ground is covered in dust called regolith.'},
            {question: 'jump', answer: "You jump and move in slow motion. The Moon's gravity is about one-sixth of Earth's."},
            {question: 'collect a rock', answer: 'You carefully collect a Moon rock sample to study what the Moon is made of.'},
            {question: 'go back to the station', answer: 'You climb back into the shuttle and head back to the space station.'},
            {question: 'help', answer: 'I don\'t know how to do that here. Try "look around", "jump", "collect a rock", or "go back to the station"'}
        ]
    },
    {
        name: 'shuttle QA',
        pairs: [
            {question: 'look around', answer: 'You look around the shuttle. It has windows, seats, and a control panel.'},
            {question: 'look out the window', answer: 'You look out the window and see a beautiful expanse of stars.'},
            {question: 'look at the seats', answer: "You look at the seats and see that they're clean and comfy."},
            {question: 'sit down', answer: 'You sit down and buckle yourself in. Safety first!'},
            {question: 'look at the control panel', answer: 'You look at the control panel. It has a button that says "moon".'},
            {question: 'press the moon button', answer: 'You press the moon button, and the shuttle engines fire!'},
            {question: 'help', answer: "I don't know how to do that. Try looking around!"}
        ]
    }
];
