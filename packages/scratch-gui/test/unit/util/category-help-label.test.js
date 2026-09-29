import {registerCategoryHelpLabelInflater, setCategoryHelpCallback} from '../../../src/lib/category-help-label';

class FakeFlyoutButton {
    constructor (workspace, targetWorkspace, json, isFlyoutLabel) {
        this.workspace = workspace;
        this.targetWorkspace = targetWorkspace;
        this.json = json;
        this.isFlyoutLabel = isFlyoutLabel;
        this.width = 100;
        this.height = 22;
        this.disposed = false;
        this.svgTextElement = {
            attrs: {y: '18'},
            getAttribute (name) {
                return this.attrs[name];
            },
            setAttribute (name, value) {
                this.attrs[name] = value;
            }
        };
        this.svgRoot = {
            querySelector: selector => (selector === 'text' ? this.svgTextElement : null)
        };
    }
    getSvgRoot () {
        return this.svgRoot;
    }
    show () {
        this.shown = true;
    }
    dispose () {
        this.disposed = true;
    }
}

class FakeLabelFlyoutInflater {
    load (state) {
        return {stock: true, state};
    }
}

class FakeFlyoutItem {
    constructor (element, type) {
        this.element = element;
        this.type = type;
    }
}

const makeFakeScratchBlocks = () => ({
    FlyoutButton: FakeFlyoutButton,
    LabelFlyoutInflater: FakeLabelFlyoutInflater,
    FlyoutItem: FakeFlyoutItem,
    registry: {
        register: jest.fn(),
        Type: {FLYOUT_INFLATER: 'flyoutInflater'}
    },
    utils: {
        dom: {
            createSvgElement: jest.fn(() => ({setAttributeNS: jest.fn()}))
        }
    },
    browserEvents: {
        bind: jest.fn(() => 'bound-wrapper'),
        unbind: jest.fn()
    }
});

const makeFakeFlyout = categoryId => ({
    targetWorkspace: {
        getToolbox: () => ({
            getCategoryByName: name => (name === 'known category' ? {getId: () => categoryId} : null)
        }),
        getFlyout: () => ({getWidth: () => 250})
    },
    getWorkspace: () => ({RTL: false, scale: 1})
});

describe('registerCategoryHelpLabelInflater', () => {
    const ScratchBlocks = makeFakeScratchBlocks();
    let InflaterClass;

    beforeAll(() => {
        registerCategoryHelpLabelInflater(ScratchBlocks);
        InflaterClass = ScratchBlocks.registry.register.mock.calls[0][2];
    });

    test('replaces the label inflater registration with overrides allowed', () => {
        const [type, name, , allowOverrides] = ScratchBlocks.registry.register.mock.calls[0];
        expect(type).toBe('flyoutInflater');
        expect(name).toBe('label');
        expect(allowOverrides).toBe(true);
    });

    test('only registers once', () => {
        registerCategoryHelpLabelInflater(ScratchBlocks);
        expect(ScratchBlocks.registry.register).toHaveBeenCalledTimes(1);
    });

    test('falls back to stock label loading for categories without help', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'known category'}, makeFakeFlyout('motion'));
        expect(item.stock).toBe(true);
    });

    test('falls back to stock label loading when no category matches the text', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'Stage selected: no motion blocks'}, makeFakeFlyout('motion'));
        expect(item.stock).toBe(true);
    });

    test('creates a help label for extensions with help defined', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'known category'}, makeFakeFlyout('handSensing'));
        expect(item).toBeInstanceOf(FakeFlyoutItem);
        expect(item.type).toBe('label');
        expect(item.element.extensionId).toBe('handSensing');
        expect(item.element.shown).toBe(true);
    });

    test('help labels use the taller header height and re-center the text, like status headers', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'known category'}, makeFakeFlyout('handSensing'));
        expect(item.element.height).toBe(40);
        // Original y 18 plus half the height delta (40 - 22) / 2.
        expect(item.element.svgTextElement.getAttribute('y')).toBe('27');
    });

    test('clicking the help button invokes the registered callback with the extension id', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'known category'}, makeFakeFlyout('handSensing'));
        const onHelpClick = jest.fn();
        setCategoryHelpCallback(onHelpClick);
        const boundListener = ScratchBlocks.browserEvents.bind.mock.calls.at(-1)[3];
        boundListener();
        expect(onHelpClick).toHaveBeenCalledWith('handSensing');
        expect(item.element.disposed).toBe(false);
    });

    test('dispose unbinds the help button listener', () => {
        const inflater = new InflaterClass();
        const item = inflater.load({text: 'known category'}, makeFakeFlyout('handSensing'));
        item.element.dispose();
        expect(ScratchBlocks.browserEvents.unbind).toHaveBeenCalledWith('bound-wrapper');
        expect(item.element.disposed).toBe(true);
    });
});
