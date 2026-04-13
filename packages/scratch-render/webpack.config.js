const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');

const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');
const {getDevPort} = require('../../scripts/worktree-dev-port');

const baseConfig = new ScratchWebpackConfigBuilder({
    rootPath: path.resolve(__dirname)
})
    .enableDevServer(getDevPort(8361, __dirname))
    .merge({
        resolve: {
            fallback: {
                Buffer: require.resolve('buffer/')
            }
        }
    });

const webConfig = baseConfig.clone()
    .setTarget('browserslist')
    .merge({
        entry: {
            'scratch-render': path.join(__dirname, 'src/index.js'),
            'scratch-render.min': path.join(__dirname, 'src/index.js')
        },
        output: {
            library: {
                name: 'ScratchRender'
            }
        }
    });

const playgroundConfig = baseConfig
    .clone()
    .setTarget('browserslist')
    .merge({
        entry: {
            playground: path.join(__dirname, 'src/playground/playground.js'),
            queryPlayground: path.join(
                __dirname,
                'src/playground/queryPlayground.js'
            )
        },
        output: {
            path: path.resolve('playground')
        }
    })
    .addPlugin(
        new CopyWebpackPlugin({
            patterns: [
                {
                    context: 'src/playground',
                    from: '*.+(html|css)'
                }
            ]
        })
    );

const nodeConfig = baseConfig.clone()
    .setTarget('node')
    .merge({
        entry: {
            'scratch-render': path.join(__dirname, 'src/index.js')
        },
        output: {
            library: {
                name: 'ScratchRender',
                type: 'commonjs2'
            }
        },
        externals: {
            '!ify-loader!grapheme-breaker': 'grapheme-breaker',
            '!ify-loader!linebreak': 'linebreak',
            'hull.js': true,
            'scratch-svg-renderer': true,
            'twgl.js': true,
            'xml-escape': true
        }
    });

module.exports = [
    // Playground
    playgroundConfig.get(),

    // Web-compatible
    webConfig.get(),

    // Node-compatible
    nodeConfig.get()
];
