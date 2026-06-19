/* eslint-disable no-console */
// Generates `popup-diorama.sb3`, a small project used to visually test the 3D
// Pop-Up extension: a colourful backdrop (so the back wall shows) and two distinct
// sprites (so depth and the front/back faces are easy to see). No scripts or
// extensions are saved; the Playwright test adds the extension and drives the blocks.
//
// Run: node test/fixtures/make-popup-diorama.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const md5 = str => crypto.createHash('md5').update(str).digest('hex');

const backdropSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8ecbff"/><stop offset="1" stop-color="#e6f6ff"/></linearGradient></defs>
  <rect width="480" height="360" fill="url(#sky)"/>
  <circle cx="84" cy="74" r="36" fill="#fff1a8"/>
  <rect y="266" width="480" height="94" fill="#7ec850"/>
  <rect y="266" width="480" height="10" fill="#6cb544"/>
</svg>`;

const starSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <polygon points="50,5 61,38 96,38 68,59 79,93 50,72 21,93 32,59 4,38 39,38"
    fill="#ff5252" stroke="#b71c1c" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

const balloonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112" viewBox="0 0 80 112">
  <line x1="40" y1="86" x2="40" y2="110" stroke="#888" stroke-width="2"/>
  <ellipse cx="40" cy="42" rx="34" ry="40" fill="#42a5f5" stroke="#1565c0" stroke-width="4"/>
  <polygon points="33,80 47,80 40,92" fill="#1565c0"/>
</svg>`;

const costume = (name, svg, rcx, rcy) => ({
    assetId: md5(svg),
    name,
    md5ext: `${md5(svg)}.svg`,
    dataFormat: 'svg',
    bitmapResolution: 1,
    rotationCenterX: rcx,
    rotationCenterY: rcy
});

const sprite = (name, svg, rcx, rcy, x, y, layerOrder) => ({
    isStage: false,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [costume(`${name}-costume`, svg, rcx, rcy)],
    sounds: [],
    volume: 100,
    layerOrder,
    visible: true,
    x,
    y,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: 'all around'
});

const project = {
    targets: [
        {
            isStage: true,
            name: 'Stage',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            currentCostume: 0,
            costumes: [costume('scene', backdropSVG, 240, 180)],
            sounds: [],
            volume: 100,
            layerOrder: 0,
            tempo: 60,
            videoTransparency: 50,
            videoState: 'on',
            textToSpeechLanguage: null
        },
        sprite('Star', starSVG, 50, 50, -120, -10, 1),
        sprite('Balloon', balloonSVG, 40, 56, 110, 40, 2)
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-fixture-generator'}
};

const zip = new JSZip();
zip.file('project.json', JSON.stringify(project));
zip.file(`${md5(backdropSVG)}.svg`, backdropSVG);
zip.file(`${md5(starSVG)}.svg`, starSVG);
zip.file(`${md5(balloonSVG)}.svg`, balloonSVG);

zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}).then(buf => {
    const out = path.join(__dirname, 'popup-diorama.sb3');
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
});
