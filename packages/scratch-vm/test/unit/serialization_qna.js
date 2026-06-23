const test = require('tap').test;
const path = require('path');
const VirtualMachine = require('../../src/index');
const sb3 = require('../../src/serialization/sb3');
const Scratch3Qna = require('../../src/extensions/scratch3_qna');
const embeddingService = require('../../src/extensions/scratch3_qna/embedding-service');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;

const exampleProjectPath = path.resolve(__dirname, '../fixtures/clone-cleanup.sb2');

// Defaults the extension backfills onto datasets lacking the no-match fields.
const DEFAULT_NO_MATCH_ANSWER = 'Sorry, I don\'t know.';
const DEFAULT_NO_MATCH_THRESHOLD = 0.55;

const sampleDatasets = [
    {
        name: 'Dinosaur Facts',
        pairs: [
            {question: 'How big was a T. rex?', answer: 'About 40 feet long and 12 feet tall at the hips!'},
            {question: 'What did Triceratops eat?', answer: 'Plants — it was a herbivore.'}
        ],
        noMatchAnswer: 'I am not sure about that dinosaur!',
        noMatchThreshold: 0.6
    }
];

// Build a Q&A extension instance without running the constructor, so the test
// does not pull in the embedding service / browser-only worker.
const makeExtension = datasets => {
    const ext = Object.create(Scratch3Qna.prototype);
    ext.runtime = {requestBlocksUpdate: () => {}};
    ext._qaDatasets = datasets;
    return ext;
};

test('qna serialize/deserialize round-trips custom datasets', t => {
    const blob = makeExtension(sampleDatasets).serialize();
    t.same(blob, {datasets: sampleDatasets});

    // A fresh instance seeded with different data restores the saved datasets.
    const restored = makeExtension([{name: 'Scratch FAQ', pairs: []}]);
    restored.deserialize(blob);
    t.same(restored._qaDatasets, sampleDatasets);
    // Restored data is a deep copy, not a shared reference to the blob.
    t.not(restored._qaDatasets, blob.datasets);
    t.not(restored._qaDatasets[0], blob.datasets[0]);
    t.end();
});

test('qna deserialize ignores malformed/missing data and keeps defaults', t => {
    const ext = makeExtension([{name: 'Scratch FAQ', pairs: []}]);
    ext.deserialize(undefined);
    ext.deserialize({});
    ext.deserialize({datasets: 'not an array'});
    t.same(ext._qaDatasets, [{name: 'Scratch FAQ', pairs: []}]);
    t.end();
});

test('qna deserialize backfills no-match fields for legacy projects', t => {
    // A project saved before the "I don't know" feature has no no-match fields.
    const legacyBlob = {datasets: [{
        name: 'Old Dataset',
        pairs: [{question: 'Hi?', answer: 'Hello!'}]
    }]};
    const ext = makeExtension([{name: 'Scratch FAQ', pairs: []}]);
    ext.deserialize(legacyBlob);
    t.same(ext._qaDatasets, [{
        name: 'Old Dataset',
        pairs: [{question: 'Hi?', answer: 'Hello!'}],
        noMatchAnswer: DEFAULT_NO_MATCH_ANSWER,
        noMatchThreshold: DEFAULT_NO_MATCH_THRESHOLD
    }]);
    t.end();
});

test('qna answerQuestion returns the no-match answer when the best score is below threshold', t => {
    const ext = makeExtension([{
        name: 'FAQ',
        pairs: [{question: 'What is Scratch?', answer: 'A coding platform.'}],
        noMatchAnswer: 'I really do not know.',
        noMatchThreshold: 0.5
    }]);
    ext._lastQAAnswer = '';
    const original = embeddingService.findMostSimilar;
    embeddingService.findMostSimilar = () => Promise.resolve({candidate: 'What is Scratch?', score: 0.3});
    return ext.answerQuestion({QUESTION: 'how do volcanoes erupt', DATASET: 'FAQ'}).then(() => {
        t.equal(ext.getQAAnswer(), 'I really do not know.');
        embeddingService.findMostSimilar = original;
    });
});

test('qna answerQuestion returns the matched answer when the best score meets threshold', t => {
    const ext = makeExtension([{
        name: 'FAQ',
        pairs: [{question: 'What is Scratch?', answer: 'A coding platform.'}],
        noMatchAnswer: 'I really do not know.',
        noMatchThreshold: 0.5
    }]);
    ext._lastQAAnswer = '';
    const original = embeddingService.findMostSimilar;
    embeddingService.findMostSimilar = () => Promise.resolve({candidate: 'What is Scratch?', score: 0.9});
    return ext.answerQuestion({QUESTION: 'what is scratch', DATASET: 'FAQ'}).then(() => {
        t.equal(ext.getQAAnswer(), 'A coding platform.');
        embeddingService.findMostSimilar = original;
    });
});

test('sb3.serialize writes extensionData.qna when a qna block is present', t => {
    const vm = new VirtualMachine();
    vm.loadProject(readFileToBuffer(exampleProjectPath)).then(() => {
        const target = vm.runtime.targets.find(tg => !tg.isStage) || vm.runtime.targets[0];
        target.blocks.createBlock({
            id: 'qnaBlock',
            opcode: 'qna_getQAAnswer',
            next: null,
            parent: null,
            inputs: {},
            fields: {},
            topLevel: true,
            shadow: false,
            x: 0,
            y: 0
        });
        vm.runtime._qnaExtension = makeExtension(sampleDatasets);

        const result = sb3.serialize(vm.runtime);
        t.ok(result.extensions.includes('qna'));
        t.type(result.extensionData, 'object');
        t.same(result.extensionData.qna, {datasets: sampleDatasets});
        t.end();
    });
});

test('sb3.serialize omits extensionData when no opted-in extension is in use', t => {
    const vm = new VirtualMachine();
    vm.loadProject(readFileToBuffer(exampleProjectPath)).then(() => {
        // _qnaExtension exists but no qna block is used, so nothing is written.
        vm.runtime._qnaExtension = makeExtension(sampleDatasets);
        const result = sb3.serialize(vm.runtime);
        t.notOk(result.extensionData);
        t.end();
    });
});

test('sb3.deserialize surfaces extensionData from the project json', t => {
    const vm = new VirtualMachine();
    const json = {
        targets: [],
        monitors: [],
        extensions: ['qna'],
        extensionData: {qna: {datasets: sampleDatasets}},
        meta: {semver: '3.0.0'}
    };
    sb3.deserialize(json, vm.runtime).then(({extensions}) => {
        t.same(extensions.extensionData, {qna: {datasets: sampleDatasets}});
        t.end();
    });
});
