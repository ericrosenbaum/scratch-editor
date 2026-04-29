const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const LocalNetworkProvider = require('./provider');

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iNCIgZmlsbD0iI2ZmZiIvPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZD0iTTExLjUgMjBhOC41IDguNSAwIDAgMSAxNyAwTTYgMjBhMTQgMTQgMCAwIDEgMjggMCIvPjwvc3ZnPg==';

// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTgiIGZpbGw9IiM0Yzk3ZmYiLz48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSI0IiBmaWxsPSIjZmZmIi8+PHBhdGggZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBkPSJNMTEuNSAyMGE4LjUgOC41IDAgMCAxIDE3IDBNNiAyMGExNCAxNCAwIDAgMSAyOCAwIi8+PC9zdmc+';

const ANIMAL_ADJECTIVES = [
    'swift', 'brave', 'jolly', 'sunny', 'lucky', 'merry', 'witty', 'gentle',
    'curious', 'quiet', 'cosmic', 'crimson', 'golden', 'silent', 'wandering'
];
const ANIMALS = [
    'otter', 'koala', 'falcon', 'fox', 'panda', 'badger', 'lynx', 'heron',
    'gecko', 'turtle', 'puffin', 'narwhal', 'sparrow', 'tapir', 'wombat'
];

const generatePeerName = () => {
    const adj = ANIMAL_ADJECTIVES[Math.floor(Math.random() * ANIMAL_ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}-${animal}-${num}`;
};

class Scratch3LocalNetwork {
    constructor (runtime) {
        this.runtime = runtime;

        this._provider = null;
        this._room = null;
        this._peerName = generatePeerName();

        this._sharedVars = new Map();
        this._knownMessages = new Set();
        this._knownVarNames = new Set();
        this._lastMessageFrom = '';
        this._lastVarChangeFrom = '';

        runtime.ext_localNetwork = this;
    }

    static get EXTENSION_ID () {
        return 'localNetwork';
    }

    /**
     * Inject a custom provider (used in tests). When unset, a real WebSocket
     * provider is created on join.
     * @param {object} factory called as factory(host, hooks) and returning a provider instance
     */
    setProviderFactory (factory) {
        this._providerFactory = factory;
    }

    getInfo () {
        return {
            id: 'localNetwork',
            name: formatMessage({
                id: 'localNetwork.categoryName',
                default: 'Local Network',
                description: 'Name of extension that adds local-network broadcasts and shared variables'
            }),
            blockIconURI,
            menuIconURI,
            blocks: [
                {
                    opcode: 'joinRoom',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'localNetwork.joinRoom',
                        default: 'join room [CODE] as [NAME]',
                        description: 'Join a network room with a code and a peer name'
                    }),
                    arguments: {
                        CODE: {
                            type: ArgumentType.STRING,
                            defaultValue: 'classroom-1'
                        },
                        NAME: {
                            type: ArgumentType.STRING,
                            defaultValue: this._peerName
                        }
                    }
                },
                {
                    opcode: 'leaveRoom',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'localNetwork.leaveRoom',
                        default: 'leave room',
                        description: 'Disconnect from the current room'
                    })
                },
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: formatMessage({
                        id: 'localNetwork.isConnected',
                        default: 'connected to room?',
                        description: 'Reporter that is true when joined to a room and the connection is open'
                    })
                },
                '---',
                {
                    opcode: 'sendBroadcast',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'localNetwork.sendBroadcast',
                        default: 'send network broadcast [MESSAGE]',
                        description: 'Send a broadcast to every other peer in the room'
                    }),
                    arguments: {
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            menu: 'messages',
                            defaultValue: 'hello'
                        }
                    }
                },
                {
                    opcode: 'whenBroadcastReceived',
                    blockType: BlockType.HAT,
                    text: formatMessage({
                        id: 'localNetwork.whenBroadcastReceived',
                        default: 'when I receive network broadcast [MESSAGE]',
                        description: 'Hat block fired when a peer in the room sends a matching broadcast'
                    }),
                    arguments: {
                        MESSAGE: {
                            type: ArgumentType.STRING,
                            menu: 'messages',
                            defaultValue: 'hello'
                        }
                    }
                },
                {
                    opcode: 'broadcastSender',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'localNetwork.broadcastSender',
                        default: 'sender of last broadcast',
                        description: 'Peer name of the sender of the most recent received broadcast'
                    })
                },
                '---',
                {
                    opcode: 'setSharedVar',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'localNetwork.setSharedVar',
                        default: 'set shared variable [NAME] to [VALUE]',
                        description: 'Set a shared variable; update propagates to every peer in the room'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            menu: 'variables',
                            defaultValue: 'score'
                        },
                        VALUE: {
                            type: ArgumentType.STRING,
                            defaultValue: '0'
                        }
                    }
                },
                {
                    opcode: 'changeSharedVar',
                    blockType: BlockType.COMMAND,
                    text: formatMessage({
                        id: 'localNetwork.changeSharedVar',
                        default: 'change shared variable [NAME] by [VALUE]',
                        description: 'Increment the numeric value of a shared variable'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            menu: 'variables',
                            defaultValue: 'score'
                        },
                        VALUE: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 1
                        }
                    }
                },
                {
                    opcode: 'getSharedVar',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'localNetwork.getSharedVar',
                        default: 'shared variable [NAME]',
                        description: 'Read the current value of a shared variable'
                    }),
                    arguments: {
                        NAME: {
                            type: ArgumentType.STRING,
                            menu: 'variables',
                            defaultValue: 'score'
                        }
                    }
                },
                '---',
                {
                    opcode: 'myPeerName',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'localNetwork.myPeerName',
                        default: 'my peer name',
                        description: 'Reporter for this editor\\u2019s peer name in the current room'
                    })
                }
            ],
            menus: {
                messages: {
                    acceptReporters: true,
                    items: 'getMessageMenu'
                },
                variables: {
                    acceptReporters: true,
                    items: 'getVariableMenu'
                }
            }
        };
    }

    getMessageMenu () {
        if (this._knownMessages.size === 0) return [{text: 'hello', value: 'hello'}];
        return Array.from(this._knownMessages).map(name => ({text: name, value: name}));
    }

    getVariableMenu () {
        if (this._knownVarNames.size === 0) return [{text: 'score', value: 'score'}];
        return Array.from(this._knownVarNames).map(name => ({text: name, value: name}));
    }

    joinRoom (args) {
        const code = Cast.toString(args.CODE).trim();
        const name = Cast.toString(args.NAME).trim() || this._peerName;
        if (!code) return;

        if (this._provider) {
            this._provider.requestCloseConnection();
            this._provider = null;
        }

        this._room = code;
        this._peerName = name;

        const hooks = {
            onBroadcast: this._onIncomingBroadcast.bind(this),
            onSetVar: this._onIncomingSetVar.bind(this),
            onSnapshot: this._onIncomingSnapshot.bind(this)
        };

        this._provider = this._providerFactory ?
            this._providerFactory(this.getHost(), this._room, this._peerName, hooks) :
            new LocalNetworkProvider(this.getHost(), this._room, this._peerName, hooks);
    }

    leaveRoom () {
        if (this._provider) {
            this._provider.requestCloseConnection();
            this._provider = null;
        }
        this._room = null;
    }

    isConnected () {
        return !!(this._provider && this._provider.isOpen());
    }

    sendBroadcast (args) {
        const name = Cast.toString(args.MESSAGE).trim();
        if (!name) return;
        this._knownMessages.add(name);
        if (this._provider) this._provider.sendBroadcast(name);
    }

    whenBroadcastReceived () {
        // Edge-triggered hat handled via runtime.startHats from _onIncomingBroadcast.
        // Returning false here means the hat does not fire on its own (no polling).
        return false;
    }

    broadcastSender () {
        return this._lastMessageFrom;
    }

    setSharedVar (args) {
        const name = Cast.toString(args.NAME).trim();
        if (!name) return;
        const value = args.VALUE;
        this._knownVarNames.add(name);
        this._sharedVars.set(name, value);
        if (this._provider) this._provider.setSharedVar(name, value);
    }

    changeSharedVar (args) {
        const name = Cast.toString(args.NAME).trim();
        if (!name) return;
        const delta = Cast.toNumber(args.VALUE);
        const current = Cast.toNumber(this._sharedVars.get(name));
        const next = current + delta;
        this._knownVarNames.add(name);
        this._sharedVars.set(name, next);
        if (this._provider) this._provider.setSharedVar(name, next);
    }

    getSharedVar (args) {
        const name = Cast.toString(args.NAME).trim();
        if (!this._sharedVars.has(name)) return '';
        return this._sharedVars.get(name);
    }

    myPeerName () {
        return this._peerName;
    }

    /**
     * Override this in subclasses or tests to point at a different relay.
     * @returns {string} websocket host (e.g. 'localnetwork.example.org')
     */
    getHost () {
        return Scratch3LocalNetwork.HOST;
    }

    _onIncomingBroadcast (message) {
        const name = message && message.name;
        if (!name) return;
        this._knownMessages.add(name);
        this._lastMessageFrom = (message.from || '');
        this.runtime.startHats('localNetwork_whenBroadcastReceived', {MESSAGE: name});
    }

    _onIncomingSetVar (message) {
        const name = message && message.name;
        if (!name) return;
        this._knownVarNames.add(name);
        this._sharedVars.set(name, message.value);
        this._lastVarChangeFrom = (message.from || '');
    }

    _onIncomingSnapshot (message) {
        const vars = (message && message.vars) || {};
        for (const name of Object.keys(vars)) {
            this._knownVarNames.add(name);
            this._sharedVars.set(name, vars[name]);
        }
    }
}

// Default relay host. Overridable by mutating
// Scratch3LocalNetwork.HOST before extension load, or by subclassing
// and overriding getHost().
Scratch3LocalNetwork.HOST = 'localnetwork.scratch.mit.edu';

module.exports = Scratch3LocalNetwork;
