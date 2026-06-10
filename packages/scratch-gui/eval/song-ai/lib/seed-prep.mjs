// Derive the "effective" seed a case actually runs against from its committed
// base seed song, applying the case's seedMutation:
//   {clearTrack: idx}            -> empty that track (harmonize: fill from scratch)
//   {maskTrack: idx, from, to}   -> remove notes in [from, to) (infill: blank a gap)
const cloneSong = song => JSON.parse(JSON.stringify(song));

export const prepareSeed = (testCase, baseSeed) => {
    if (!baseSeed) return null;
    const mut = testCase.seedMutation;
    if (!mut) return baseSeed;
    const song = cloneSong(baseSeed);
    const tracks = song.tracks || [];
    if (typeof mut.clearTrack === 'number' && tracks[mut.clearTrack]) {
        tracks[mut.clearTrack].notes = [];
    }
    if (typeof mut.maskTrack === 'number' && tracks[mut.maskTrack]) {
        const t = tracks[mut.maskTrack];
        t.notes = (t.notes || []).filter(n => {
            const start = n.step || 0;
            return start < mut.from || start >= mut.to;
        });
    }
    return song;
};
