// Dev-only harness that renders one tip's `_capturedBlocks` at a time via
// the same BlockPreview component used in the unstuck card, and exposes
// window globals so a Playwright spec can capture each tip as a JPEG and
// write the result to block-thumbnails-cache.json.
//
// Reached at /block-thumbnail-harness.html (see webpack.config.js entry).

import React from 'react';
import ReactDomClient from 'react-dom/client';
import VM from '@scratch/scratch-vm';
import * as ScratchBlocks from 'scratch-blocks';

import BlockPreview from '../components/unstuck-card/block-preview.jsx';
import blockToImage from '../lib/backpack/block-to-image';
import jpegThumbnail from '../lib/backpack/jpeg-thumbnail';
import connectVmToBlocks from '../lib/blocks.js';
import defineDynamicBlock from '../lib/define-dynamic-block';
import tips from '../lib/libraries/tips/index.js';

const vm = new VM();

// Without setLocale, Blockly.Msg keys are all undefined and most block
// init() calls fail with "args0 must have a corresponding message0".
// connectVmToBlocks installs init() functions for the dynamic-menu blocks
// (sound_sounds_menu, sensing_touchingobjectmenu, control_create_clone_of_menu,
// motion_goto_menu, etc.) which scratch-blocks ships as empty stubs. Both
// are normally wired in containers/blocks.jsx; the harness mounts BlockPreview
// directly so we set them up here.
ScratchBlocks.ScratchMsgs.setLocale('en');
connectVmToBlocks(vm);

// Mirror the parts of containers/blocks.jsx#handleExtensionAdded that
// register an extension's block definitions with scratch-blocks. Without
// this, extension blocks (pen, music, text-to-speech, translate, …) load
// into the VM but scratch-blocks doesn't know how to instantiate them, so
// BlockPreview's domToWorkspace silently drops them.
const handleExtensionAdded = categoryInfo => {
    const defineBlocks = blockInfoArray => {
        if (!blockInfoArray || blockInfoArray.length === 0) return;
        const staticBlocksJson = [];
        const dynamicBlocksInfo = [];
        for (const blockInfo of blockInfoArray) {
            if (blockInfo.info && blockInfo.info.isDynamic) {
                dynamicBlocksInfo.push(blockInfo);
            } else if (blockInfo.json) {
                staticBlocksJson.push(blockInfo.json);
            }
        }
        ScratchBlocks.defineBlocksWithJsonArray(staticBlocksJson);
        for (const blockInfo of dynamicBlocksInfo) {
            const extendedOpcode = `${categoryInfo.id}_${blockInfo.info.opcode}`;
            ScratchBlocks.Blocks[extendedOpcode] = defineDynamicBlock(
                ScratchBlocks, categoryInfo, blockInfo, extendedOpcode
            );
        }
    };

    defineBlocks(
        Object.getOwnPropertyNames(categoryInfo.customFieldTypes)
            .map(n => categoryInfo.customFieldTypes[n].scratchBlocksDefinition)
    );
    defineBlocks(categoryInfo.menus);
    defineBlocks(categoryInfo.blocks);
};
vm.on('EXTENSION_ADDED', handleExtensionAdded);

// Mirrors KNOWN_EXTENSION_IDS in block-preview.jsx — keep in sync.
const KNOWN_EXTENSION_IDS = new Set([
    'pen', 'wedo2', 'music', 'microbit', 'text2speech', 'translate',
    'videoSensing', 'ev3', 'makeymakey', 'boost', 'gdxfor', 'faceSensing'
]);

const extensionsForBlocks = blocks => {
    const ids = new Set();
    if (!Array.isArray(blocks)) return ids;
    for (const b of blocks) {
        if (!b || !b.opcode) continue;
        const idx = b.opcode.indexOf('_');
        if (idx <= 0) continue;
        const prefix = b.opcode.slice(0, idx);
        if (KNOWN_EXTENSION_IDS.has(prefix)) ids.add(prefix);
    }
    return ids;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const host = document.createElement('div');
// Off-screen but in the DOM — Blockly needs layout/getBoundingClientRect to work.
host.style.position = 'fixed';
host.style.left = '-100000px';
host.style.top = '0';
document.body.appendChild(host);

let currentRoot = null;
let currentRef = null;

const unmountCurrent = async () => {
    if (currentRoot) {
        currentRoot.unmount();
        currentRoot = null;
        currentRef = null;
        await sleep(20);
    }
};

window.__renderTipBlocks = async tipId => {
    const tip = tips[tipId];
    if (!tip || !tip._capturedBlocks || tip._capturedBlocks.length === 0) {
        throw new Error(`Tip ${tipId} has no _capturedBlocks`);
    }

    await unmountCurrent();

    // Pre-load any required extensions before mounting so BlockPreview's
    // first render already has the block definitions. Avoids racing the
    // EXTENSION_ADDED re-render path.
    const extIds = extensionsForBlocks(tip._capturedBlocks);
    for (const extId of extIds) {
        if (vm.extensionManager && !vm.extensionManager.isExtensionLoaded(extId)) {
            try {
                await vm.extensionManager.loadExtensionURL(extId);
            } catch (e) {
                // Non-fatal: extension load may fail in the harness if it
                // requires hardware/permissions. The render will then be
                // partial, which still produces a usable thumbnail.
            }
        }
    }

    currentRef = React.createRef();
    currentRoot = ReactDomClient.createRoot(host);
    currentRoot.render(
        React.createElement(BlockPreview, {
            blocks: tip._capturedBlocks,
            vm,
            ref: currentRef
        })
    );

    // BlockPreview defers layout 100ms inside buildBlocks(). Wait long
    // enough for React mount + Blockly inject + that internal timeout.
    await sleep(400);
    return true;
};

window.__captureFirstTopBlock = async () => {
    if (!currentRef || !currentRef.current || !currentRef.current.workspace) {
        throw new Error('No active BlockPreview workspace');
    }
    const workspace = currentRef.current.workspace;
    const topBlocks = workspace.getTopBlocks(true);
    if (!topBlocks || topBlocks.length === 0) {
        throw new Error('Workspace has no top-level blocks');
    }
    const svgDataUrl = await blockToImage(topBlocks[0].id, workspace);
    return jpegThumbnail(svgDataUrl);
};

window.__harnessReady = true;
