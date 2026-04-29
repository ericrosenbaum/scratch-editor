const test = require('tap').test;
const LocalNetwork = require('../../src/extensions/scratch3_local_network/index.js');

const makeFakeRuntime = () => ({
    startedHats: [],
    startHats (opcode, fields) {
        this.startedHats.push({opcode, fields});
    }
});

class FakeProvider {
    constructor () {
        this.broadcasts = [];
        this.vars = {};
        this.closed = false;
        this.open = true;
    }
    sendBroadcast (name) {
        this.broadcasts.push(name);
    }
    setSharedVar (name, value) {
        this.vars[name] = value;
    }
    requestCloseConnection () {
        this.closed = true;
        this.open = false;
    }
    isOpen () {
        return this.open;
    }
}

const buildExtension = () => {
    const runtime = makeFakeRuntime();
    const ext = new LocalNetwork(runtime);
    const provider = new FakeProvider();
    ext.setProviderFactory(() => provider);
    ext.joinRoom({CODE: 'classroom-1', NAME: 'tester'});
    return {ext, runtime, provider};
};

test('joinRoom registers the extension on runtime and creates a provider', t => {
    const runtime = makeFakeRuntime();
    const ext = new LocalNetwork(runtime);
    t.equal(runtime.ext_localNetwork, ext);

    const provider = new FakeProvider();
    ext.setProviderFactory(() => provider);
    ext.joinRoom({CODE: 'roomA', NAME: 'alice'});
    t.equal(ext.myPeerName(), 'alice');
    t.ok(ext.isConnected());
    t.end();
});

test('sendBroadcast forwards to provider and records the message name', t => {
    const {ext, provider} = buildExtension();
    ext.sendBroadcast({MESSAGE: 'jump'});
    t.same(provider.broadcasts, ['jump']);
    t.same(ext.getMessageMenu().map(m => m.value)
        .sort(), ['jump']);
    t.end();
});

test('incoming broadcast triggers startHats with the right fields', t => {
    const {ext, runtime} = buildExtension();
    ext._onIncomingBroadcast({name: 'GAME_OVER', from: 'brave-koala-9'});
    t.equal(runtime.startedHats.length, 1);
    t.equal(runtime.startedHats[0].opcode, 'localNetwork_whenBroadcastReceived');
    t.same(runtime.startedHats[0].fields, {MESSAGE: 'GAME_OVER'});
    t.equal(ext.broadcastSender(), 'brave-koala-9');
    t.end();
});

test('setSharedVar stores locally and forwards to provider', t => {
    const {ext, provider} = buildExtension();
    ext.setSharedVar({NAME: 'score', VALUE: 17});
    t.equal(ext.getSharedVar({NAME: 'score'}), 17);
    t.equal(provider.vars.score, 17);
    t.end();
});

test('changeSharedVar increments numerically and forwards delta result', t => {
    const {ext, provider} = buildExtension();
    ext.setSharedVar({NAME: 'score', VALUE: 5});
    ext.changeSharedVar({NAME: 'score', VALUE: 3});
    t.equal(ext.getSharedVar({NAME: 'score'}), 8);
    t.equal(provider.vars.score, 8);
    t.end();
});

test('incoming setvar updates local store without re-emitting', t => {
    const {ext, provider} = buildExtension();
    ext._onIncomingSetVar({name: 'health', value: 99, from: 'alice'});
    t.equal(ext.getSharedVar({NAME: 'health'}), 99);
    t.notOk(Object.prototype.hasOwnProperty.call(provider.vars, 'health'));
    t.end();
});

test('snapshot seeds known variables on join', t => {
    const {ext} = buildExtension();
    ext._onIncomingSnapshot({vars: {score: 4, level: 2}, peers: ['alice']});
    t.equal(ext.getSharedVar({NAME: 'score'}), 4);
    t.equal(ext.getSharedVar({NAME: 'level'}), 2);
    t.same(ext.getVariableMenu().map(m => m.value)
        .sort(), ['level', 'score']);
    t.end();
});

test('leaveRoom closes the provider', t => {
    const {ext, provider} = buildExtension();
    ext.leaveRoom();
    t.ok(provider.closed);
    t.notOk(ext.isConnected());
    t.end();
});

test('getInfo declares hat, command, reporter, boolean, and menus', t => {
    const ext = new LocalNetwork(makeFakeRuntime());
    const info = ext.getInfo();
    t.equal(info.id, 'localNetwork');
    const opcodes = info.blocks.filter(b => typeof b === 'object').map(b => b.opcode);
    t.ok(opcodes.includes('whenBroadcastReceived'));
    t.ok(opcodes.includes('sendBroadcast'));
    t.ok(opcodes.includes('setSharedVar'));
    t.ok(opcodes.includes('getSharedVar'));
    t.ok(opcodes.includes('isConnected'));
    t.ok(info.menus.messages);
    t.ok(info.menus.variables);
    t.end();
});
