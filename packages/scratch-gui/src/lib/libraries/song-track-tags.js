import {defineMessages} from 'react-intl';

// Filter chips for the song-maker track/section library. LibraryComponent's tag
// bar is a single flat list, so four facets share it: GENRE, MOOD, CONTEXT, and
// ROLE. Items in song-tracks.json carry a mix (e.g. ['chiptune','upbeat',
// 'platformer','melody']); the bar exposes a curated subset while free-text
// search still matches any tag. Facets follow the Phase 0 genre research
// (context-first, genre-second; cover both the 8-10 and 11+ cohorts).
const messages = defineMessages({
    // Genre
    chiptune: {defaultMessage: 'Chiptune', description: 'Song library genre', id: 'gui.songLibraryTags.chiptune'},
    lofi: {defaultMessage: 'Lo-fi', description: 'Song library genre', id: 'gui.songLibraryTags.lofi'},
    rock: {defaultMessage: 'Rock', description: 'Song library genre', id: 'gui.songLibraryTags.rock'},
    funk: {defaultMessage: 'Funk', description: 'Song library genre', id: 'gui.songLibraryTags.funk'},
    electronic: {defaultMessage: 'Electronic', description: 'Song library genre', id: 'gui.songLibraryTags.electronic'},
    ambient: {defaultMessage: 'Ambient', description: 'Song library genre', id: 'gui.songLibraryTags.ambient'},
    cinematic: {defaultMessage: 'Cinematic', description: 'Song library genre', id: 'gui.songLibraryTags.cinematic'},
    // Mood
    happy: {defaultMessage: 'Happy', description: 'Song library mood', id: 'gui.songLibraryTags.happy'},
    epic: {defaultMessage: 'Epic', description: 'Song library mood', id: 'gui.songLibraryTags.epic'},
    chill: {defaultMessage: 'Chill', description: 'Song library mood', id: 'gui.songLibraryTags.chill'},
    spooky: {defaultMessage: 'Spooky', description: 'Song library mood', id: 'gui.songLibraryTags.spooky'},
    upbeat: {defaultMessage: 'Upbeat', description: 'Song library mood', id: 'gui.songLibraryTags.upbeat'},
    sad: {defaultMessage: 'Sad', description: 'Song library mood', id: 'gui.songLibraryTags.sad'},
    // Context (what the music is for)
    platformer: {defaultMessage: 'Platformer', description: 'Song lib context', id: 'gui.songLibraryTags.platformer'},
    boss: {defaultMessage: 'Boss Battle', description: 'Song library context', id: 'gui.songLibraryTags.boss'},
    racing: {defaultMessage: 'Racing', description: 'Song library context', id: 'gui.songLibraryTags.racing'},
    underwater: {defaultMessage: 'Underwater', description: 'Song lib context', id: 'gui.songLibraryTags.underwater'},
    dance: {defaultMessage: 'Dance', description: 'Song library context', id: 'gui.songLibraryTags.dance'},
    story: {defaultMessage: 'Story', description: 'Song library context', id: 'gui.songLibraryTags.story'},
    // Role (which part of the arrangement)
    melody: {defaultMessage: 'Melody', description: 'Song library role', id: 'gui.songLibraryTags.melody'},
    bass: {defaultMessage: 'Bass', description: 'Song library role', id: 'gui.songLibraryTags.bass'},
    pad: {defaultMessage: 'Pad', description: 'Song library role', id: 'gui.songLibraryTags.pad'},
    lead: {defaultMessage: 'Lead', description: 'Song library role', id: 'gui.songLibraryTags.lead'},
    drums: {defaultMessage: 'Drums', description: 'Song library role', id: 'gui.songLibraryTags.drums'}
});

export default [
    {tag: 'chiptune', intlLabel: messages.chiptune},
    {tag: 'lofi', intlLabel: messages.lofi},
    {tag: 'rock', intlLabel: messages.rock},
    {tag: 'funk', intlLabel: messages.funk},
    {tag: 'electronic', intlLabel: messages.electronic},
    {tag: 'ambient', intlLabel: messages.ambient},
    {tag: 'cinematic', intlLabel: messages.cinematic},
    {tag: 'happy', intlLabel: messages.happy},
    {tag: 'epic', intlLabel: messages.epic},
    {tag: 'chill', intlLabel: messages.chill},
    {tag: 'spooky', intlLabel: messages.spooky},
    {tag: 'upbeat', intlLabel: messages.upbeat},
    {tag: 'sad', intlLabel: messages.sad},
    {tag: 'platformer', intlLabel: messages.platformer},
    {tag: 'boss', intlLabel: messages.boss},
    {tag: 'racing', intlLabel: messages.racing},
    {tag: 'underwater', intlLabel: messages.underwater},
    {tag: 'dance', intlLabel: messages.dance},
    {tag: 'story', intlLabel: messages.story},
    {tag: 'melody', intlLabel: messages.melody},
    {tag: 'bass', intlLabel: messages.bass},
    {tag: 'pad', intlLabel: messages.pad},
    {tag: 'lead', intlLabel: messages.lead},
    {tag: 'drums', intlLabel: messages.drums}
];
