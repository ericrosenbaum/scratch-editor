/**
 * @file Hand-authored SVG costumes for the `Scratch.svg` example projects. Each
 * costume is plain SVG source with `id` attributes on the parts a project's
 * blocks reach for, and `data-pivot="x y"` hints on parts meant to rotate (the
 * VM's Scratch.svg.rotate uses them as the default pivot). The costumes are
 * installed as ordinary vector costumes — Scratch.svg's edits to them are
 * display-only and never touch these assets.
 */

/* eslint-disable @stylistic/max-len */
// SVG sources read better with one element per line, however long.

/** A wooden sign with two replaceable text lines (ids: line1, line2). */
const SIGN_COSTUME = {
    name: 'sign',
    rotationCenterX: 160,
    rotationCenterY: 110,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">
  <rect id="post" x="150" y="160" width="20" height="60" fill="#8d5524"/>
  <rect id="board" x="10" y="20" width="300" height="150" rx="18" fill="#a9713a" stroke="#5e3a17" stroke-width="6"/>
  <rect id="panel" x="26" y="36" width="268" height="118" rx="10" fill="#f7ecd4"/>
  <text id="line1" x="160" y="88" font-family="Sans Serif" font-size="34" text-anchor="middle" fill="#3b3b3b">CLICK THE FLAG</text>
  <text id="line2" x="160" y="134" font-family="Sans Serif" font-size="26" text-anchor="middle" fill="#c0392b">...</text>
</svg>
`
};

/**
 * A robot puppet. Ids a project can reach: light, head, pupil-left, pupil-right,
 * brow-left, brow-right (pivoted), mouth-smile, mouth-open (hidden), body,
 * panel, arm-left, arm-right (pivoted at the shoulders), leg-left, leg-right.
 */
const ROBOT_COSTUME = {
    name: 'robot',
    rotationCenterX: 110,
    rotationCenterY: 140,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="280" viewBox="0 0 220 280">
  <g id="antenna">
    <rect x="107" y="12" width="6" height="20" fill="#78909c"/>
    <circle id="light" cx="110" cy="10" r="8" fill="#f1c40f" stroke="#b7950b" stroke-width="2"/>
  </g>
  <rect id="head" x="55" y="30" width="110" height="92" rx="14" fill="#b0bec5" stroke="#78909c" stroke-width="4"/>
  <g id="eye-left">
    <circle cx="85" cy="66" r="15" fill="#ffffff" stroke="#78909c" stroke-width="3"/>
    <circle id="pupil-left" cx="85" cy="66" r="6" fill="#263238"/>
  </g>
  <g id="eye-right">
    <circle cx="135" cy="66" r="15" fill="#ffffff" stroke="#78909c" stroke-width="3"/>
    <circle id="pupil-right" cx="135" cy="66" r="6" fill="#263238"/>
  </g>
  <line id="brow-left" x1="70" y1="44" x2="100" y2="44" stroke="#37474f" stroke-width="5" stroke-linecap="round" data-pivot="85 44"/>
  <line id="brow-right" x1="120" y1="44" x2="150" y2="44" stroke="#37474f" stroke-width="5" stroke-linecap="round" data-pivot="135 44"/>
  <path id="mouth-smile" d="M 85 96 Q 110 114 135 96" fill="none" stroke="#37474f" stroke-width="5" stroke-linecap="round"/>
  <ellipse id="mouth-open" cx="110" cy="100" rx="16" ry="11" fill="#37474f" display="none"/>
  <rect id="body" x="70" y="122" width="80" height="92" rx="12" fill="#90a4ae" stroke="#78909c" stroke-width="4"/>
  <rect id="panel" x="86" y="138" width="48" height="34" rx="6" fill="#607d8b"/>
  <circle cx="98" cy="190" r="5" fill="#eceff1"/>
  <circle cx="122" cy="190" r="5" fill="#eceff1"/>
  <g id="arm-left" data-pivot="70 132">
    <rect x="24" y="126" width="48" height="12" rx="6" fill="#78909c"/>
    <circle cx="26" cy="132" r="9" fill="#b0bec5" stroke="#78909c" stroke-width="3"/>
    <circle cx="70" cy="132" r="8" fill="#90a4ae" stroke="#78909c" stroke-width="3"/>
  </g>
  <g id="arm-right" data-pivot="150 132">
    <rect x="148" y="126" width="48" height="12" rx="6" fill="#78909c"/>
    <circle cx="194" cy="132" r="9" fill="#b0bec5" stroke="#78909c" stroke-width="3"/>
    <circle cx="150" cy="132" r="8" fill="#90a4ae" stroke="#78909c" stroke-width="3"/>
  </g>
  <rect id="leg-left" x="84" y="214" width="16" height="42" rx="6" fill="#78909c"/>
  <rect id="leg-right" x="120" y="214" width="16" height="42" rx="6" fill="#78909c"/>
  <rect x="76" y="252" width="30" height="12" rx="6" fill="#546e7a"/>
  <rect x="114" y="252" width="30" height="12" rx="6" fill="#546e7a"/>
</svg>
`
};

/**
 * Install one authored SVG costume onto the editing target as a normal vector
 * costume (cached in storage, added via vm.addCostume, becomes the current
 * costume). Loading the same project twice simply adds another copy, like
 * re-importing any costume.
 * @param {VirtualMachine} vm - the VM.
 * @param {object} costumeSource - {name, svg, rotationCenterX, rotationCenterY}.
 * @returns {Promise} resolves when the costume is added.
 */
const addSvgCostume = (vm, costumeSource) => {
    const storage = vm.runtime.storage;
    const target = vm.editingTarget;
    if (!storage || !target) return Promise.resolve();
    const asset = storage.createAsset(
        storage.AssetType.ImageVector,
        storage.DataFormat.SVG,
        new TextEncoder().encode(costumeSource.svg),
        null,
        true // generate md5
    );
    const costume = {
        name: costumeSource.name,
        dataFormat: storage.DataFormat.SVG,
        asset,
        md5: `${asset.assetId}.${storage.DataFormat.SVG}`,
        assetId: asset.assetId,
        rotationCenterX: costumeSource.rotationCenterX,
        rotationCenterY: costumeSource.rotationCenterY,
        bitmapResolution: 1
    };
    return vm.addCostume(costume.md5, costume, target.id);
};

export {SIGN_COSTUME, ROBOT_COSTUME, addSvgCostume};
