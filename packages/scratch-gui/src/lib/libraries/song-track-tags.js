import {defineMessages} from 'react-intl';

// Filter chips for the song-maker track/section library. Like the sprite,
// backdrop, and sound libraries, this is a short single-row set of broad
// shortcuts — a curated cross-section of genre, mood, and use rather than the
// full tag vocabulary. Items in song-tracks.json carry many more tags (e.g.
// 'platformer', 'synthwave', 'drums'); free-text search still matches any of
// them, so trimming the chip row only drops the one-click shortcut.
const messages = defineMessages({
    // Genre
    chiptune: {defaultMessage: 'Chiptune', description: 'Song library genre', id: 'gui.songLibraryTags.chiptune'},
    rock: {defaultMessage: 'Rock', description: 'Song library genre', id: 'gui.songLibraryTags.rock'},
    // Mood
    epic: {defaultMessage: 'Epic', description: 'Song library mood', id: 'gui.songLibraryTags.epic'},
    chill: {defaultMessage: 'Chill', description: 'Song library mood', id: 'gui.songLibraryTags.chill'},
    spooky: {defaultMessage: 'Spooky', description: 'Song library mood', id: 'gui.songLibraryTags.spooky'},
    happy: {defaultMessage: 'Happy', description: 'Song library mood', id: 'gui.songLibraryTags.happy'},
    // Use
    game: {defaultMessage: 'Game', description: 'Song library context', id: 'gui.songLibraryTags.game'},
    dance: {defaultMessage: 'Dance', description: 'Song library context', id: 'gui.songLibraryTags.dance'}
});

export default [
    {tag: 'chiptune', intlLabel: messages.chiptune},
    {tag: 'rock', intlLabel: messages.rock},
    {tag: 'epic', intlLabel: messages.epic},
    {tag: 'chill', intlLabel: messages.chill},
    {tag: 'spooky', intlLabel: messages.spooky},
    {tag: 'happy', intlLabel: messages.happy},
    {tag: 'game', intlLabel: messages.game},
    {tag: 'dance', intlLabel: messages.dance}
];
