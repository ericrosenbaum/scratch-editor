const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE_PORTS = {
    'scratch-gui': 8601,
    'scratch-render': 8361,
    'scratch-vm': 8073,
    'scratch-svg-renderer': 8576
};

const findWorktreeRoot = startDir => {
    let dir = path.resolve(startDir);
    while (true) {
        const gitPath = path.join(dir, '.git');
        if (fs.existsSync(gitPath)) {
            return {root: dir, gitPath, isLinked: fs.statSync(gitPath).isFile()};
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
};

const computeOffset = rootPath => {
    const digest = crypto.createHash('sha1').update(rootPath).digest();
    const bucket = digest.readUInt16BE(0) % 90;
    return (bucket + 1) * 10;
};

const getDevPort = (basePort, fromDir) => {
    if (process.env.PORT) return Number(process.env.PORT);
    const info = findWorktreeRoot(fromDir || process.cwd());
    if (!info || !info.isLinked) return basePort;
    return basePort + computeOffset(info.root);
};

const printDevPorts = () => {
    const info = findWorktreeRoot(process.cwd());
    if (!info) {
        console.log('Not inside a git repository.');
        return;
    }
    const offset = info.isLinked ? computeOffset(info.root) : 0;
    const kind = info.isLinked ? 'linked worktree' : 'primary clone';
    console.log(`${kind}: ${info.root}`);
    console.log(`port offset: +${offset}`);
    for (const [name, base] of Object.entries(BASE_PORTS)) {
        console.log(`  ${name.padEnd(22)} http://localhost:${base + offset}/`);
    }
};

module.exports = {getDevPort, printDevPorts, BASE_PORTS};

if (require.main === module) printDevPorts();
