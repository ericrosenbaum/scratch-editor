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
    },
    {
        name: 'ask Scratch Cat',
        pairs: [
            {
                question: "what's your name?",
                answer:
                    "I'm Scratch Cat! I've been the mascot of Scratch since the very beginning."
            },
            {
                question: 'how old are you?',
                answer:
                    "I was born in 2007 when Scratch was first created at MIT. " +
                    "That makes me pretty old in cat years!"
            },
            {
                question: "what's your favorite food?",
                answer:
                    "Fish, obviously! I also love a good bowl of milk after a long day of coding."
            },
            {
                question: 'do you have any friends?',
                answer:
                    "Yes! My best friends are Gobo, Nano, Tera, and Pico. " +
                    "You can find them in the sprite library."
            },
            {
                question: 'what do you like to do?',
                answer:
                    "I love making projects! Dancing, telling stories, and playing games " +
                    "are some of my favorites. I also like exploring new extensions."
            },
            {
                question: 'where do you live?',
                answer:
                    "I live on the Scratch stage! It's 480 steps wide and 360 steps tall. " +
                    "My favorite spot is right in the center at x 0 y 0."
            },
            {
                question: "what's your favorite color?",
                answer:
                    "Orange, like me! But I also love changing colors with the " +
                    "color effect block — purple is fun too."
            },
            {
                question: 'can you do any tricks?',
                answer:
                    "I can glide across the stage, spin around, change my size, " +
                    "and switch between my costumes. Watch this — next costume!"
            },
            {
                question: "what's your favorite game?",
                answer:
                    "I love Pong! It's a classic. I also like any game where " +
                    "I get to chase things around the stage."
            },
            {
                question: 'do you have any pets?',
                answer:
                    "I have a little mouse friend, but things can get awkward between us. " +
                    "You know, the whole cat and mouse thing."
            },
            {
                question: "what's your favorite subject in school?",
                answer:
                    "Computer science, of course! But I also really like art class " +
                    "because I get to draw new costumes for myself."
            },
            {
                question: 'what are you afraid of?',
                answer:
                    "I get nervous when someone drags me to the edge of the stage. " +
                    "Also, the delete button. Please don't delete me!"
            },
            {
                question: "what's your favorite music?",
                answer:
                    "I love the Scratch sound library! Meow is my signature sound, " +
                    "but I also like playing the drums with the music extension."
            },
            {
                question: 'do you have any superpowers?',
                answer:
                    "I can clone myself! I can also turn invisible with the ghost effect, " +
                    "and I never get tired no matter how many forever loops I run."
            },
            {
                question: 'what do you want to be when you grow up?',
                answer:
                    "I want to help every kid in the world learn to code! " +
                    "That's kind of already my job, and I love it."
            },
            {
                question: 'how many costumes do you have?',
                answer:
                    "I come with two costumes by default, but you can draw as many " +
                    "new ones as you want in the costume editor!"
            },
            {
                question: 'what is your favorite block?',
                answer:
                    "The 'when green flag clicked' block! It means something fun " +
                    "is about to happen."
            },
            {
                question: 'can you talk?',
                answer:
                    "I can say things with the say block, and I can think things " +
                    "with the think block. Right now I'm using the Q and A extension to talk to you!"
            },
            {
                question: 'do you sleep?',
                answer:
                    "Only when someone uses a wait block! Otherwise I'm always " +
                    "ready to go. Green flag means go time."
            },
            {
                question: 'tell me a joke',
                answer:
                    "Why did the cat sit on the computer? To keep an eye on the mouse! " +
                    "Get it? I crack myself up."
            }
        ]
    },
    {
        name: 'pong FAQ',
        pairs: [
            {
                question: 'how do I play?',
                answer:
                    'Click the green flag to start, then use the up and down arrow keys ' +
                    'to move your paddle and keep the ball in play.'
            },
            {
                question: 'how do I score points?',
                answer:
                    'You get a point each time the ball bounces off your paddle. ' +
                    'Your score is shown on the stage.'
            },
            {
                question: 'how do I win?',
                answer:
                    "Try to get the highest score you can! There's no set winning score — " +
                    "just keep the ball going as long as possible and beat your best."
            },
            {
                question: 'what happens if I miss the ball?',
                answer:
                    "Game over! Your score resets back to zero and the ball starts again. " +
                    "Click the green flag to play again."
            },
            {
                question: 'how do I restart the game?',
                answer:
                    'Click the green flag at the top of the stage. ' +
                    'That resets the score and starts the ball moving again.'
            },
            {
                question: 'how do I make the ball go faster?',
                answer:
                    "Find the 'move' block in the ball's script and change the number " +
                    "to something bigger. Try 15 or 20 for a real challenge!"
            },
            {
                question: 'how do I make the paddle bigger or smaller?',
                answer:
                    "Select the paddle sprite, then go to the Costumes tab and use " +
                    "the drawing tools to resize it. A bigger paddle is easier!"
            },
            {
                question: 'what is the line for?',
                answer:
                    'The line marks the boundary of the playing area. ' +
                    'If the ball gets past it, you missed!'
            },
            {
                question: 'can I add a second player?',
                answer:
                    "Yes! Duplicate the paddle sprite, change its controls to different keys " +
                    "like W and S, and put it on the other side of the stage."
            },
            {
                question: 'how do I add sound effects?',
                answer:
                    "Pick a sound from the Sounds tab for the ball sprite, then add a " +
                    "'play sound' block where the ball bounces off the paddle."
            },
            {
                question: 'can I change what the ball looks like?',
                answer:
                    "Yes! Click on the ball sprite, go to the Costumes tab, and draw " +
                    "whatever you want. Try a star or a face!"
            },
            {
                question: 'how do I change the background?',
                answer:
                    "Click the stage in the sprite list, then go to the Backdrops tab. " +
                    "You can pick one from the library or draw your own."
            },
            {
                question: 'why does the ball go through the paddle sometimes?',
                answer:
                    "The ball might be moving too fast and skipping over the paddle. " +
                    "Try making the ball slower or the paddle bigger."
            },
            {
                question: 'how do I make the ball bounce at different angles?',
                answer:
                    "The ball uses 'if on edge, bounce' to bounce off walls. You can " +
                    "add a 'point in direction' block with a random angle when it hits the paddle."
            },
            {
                question: 'how do I add a high score?',
                answer:
                    "Make a new variable called 'high score'. Use an if block to check " +
                    "if your score is bigger than the high score, and if so, set it."
            }
        ]
    }
];
