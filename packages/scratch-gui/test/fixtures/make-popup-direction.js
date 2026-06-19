/* eslint-disable no-console */
// Generates `popup-direction.sb3`: a single right-pointing arrow sprite set to
// direction 0 (i.e. pointing up). Used to verify that the 3D Pop-Up extrusion
// honours the sprite's direction (the arrow should point up in 3D, not right).
//
// Run: node test/fixtures/make-popup-direction.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const md5 = str => crypto.createHash('md5').update(str).digest('hex');

// Arrow points RIGHT in its artwork, so direction 90 = no rotation.
const arrowSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <polygon points="2,28 70,28 70,10 118,40 70,70 70,52 2,52"
    fill="#e64980" stroke="#a61e4d" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

const backdropSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <rect width="480" height="360" fill="#eef2ff"/>
  <rect y="300" width="480" height="60" fill="#cdd6f4"/>
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

const project = {
    targets: [
        {
            isStage: true,
            name: 'Stage',
            variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0,
            costumes: [costume('scene', backdropSVG, 240, 180)],
            sounds: [], volume: 100, layerOrder: 0,
            tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null
        },
        {
            isStage: false,
            name: 'Arrow',
            variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {},
            currentCostume: 0,
            costumes: [costume('arrow', arrowSVG, 60, 40)],
            sounds: [], volume: 100, layerOrder: 1,
            visible: true,
            x: 0, y: 0, size: 160,
            direction: 0, // points up
            draggable: false,
            rotationStyle: 'all around'
        }
    ],
    monitors: [],
    extensions: [],
    meta: {semver: '3.0.0', vm: '0.0.0', agent: 'popup-fixture-generator'}
};

const zip = new JSZip();
zip.file('project.json', JSON.stringify(project));
zip.file(`${md5(arrowSVG)}.svg`, arrowSVG);
zip.file(`${md5(backdropSVG)}.svg`, backdropSVG);

zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'}).then(buf => {
    const out = path.join(__dirname, 'popup-direction.sb3');
    fs.writeFileSync(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
});
