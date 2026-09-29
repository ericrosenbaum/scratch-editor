const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');

const ScratchWebpackConfigBuilder = require('scratch-webpack-configuration');

const common = {
    libraryName: 'scratch-vm',
    rootPath: path.resolve(__dirname)
};

// MediaPipe ships tasks-vision as a prebuilt, self-contained bundle with no static
// requires. Its one dynamic import() is a module-worker fallback for loading the WASM
// loader script, and the URL is only known at runtime. Parsing it buys nothing: webpack
// can't resolve that expression, so it warns and emits an empty context module that
// throws if it's ever reached. Skipping the parse drops both and leaves the native
// import() intact, which is what that fallback actually needs.
const skipMediapipeParse = {
    module: {
        noParse: /@mediapipe[\\/]tasks-vision[\\/]vision_bundle\.(cjs|mjs|js)$/
    }
};

const nodeBuilder = new ScratchWebpackConfigBuilder(common)
    .setTarget('node')
    .merge(skipMediapipeParse)
    .merge({
        entry: {
            'extension-worker': path.join(__dirname, 'src/extension-support/extension-worker.js')
        },
        output: {
            library: {
                name: 'VirtualMachine'
            }
        }
    });

const webBuilder = new ScratchWebpackConfigBuilder(common)
    .setTarget('browserslist')
    .merge(skipMediapipeParse)
    .merge({
        entry: {
            'extension-worker': path.join(__dirname, 'src/extension-support/extension-worker.js'),
            'hand-sensing-worker': path.join(__dirname, 'src/extensions/scratch3_hand_sensing/hand-sensing-worker.js')
        },
        resolve: {
            fallback: {
                Buffer: require.resolve('buffer/')
            }
        },
        output: {
            library: {
                name: 'VirtualMachine'
            }
        }
    })
    .addModuleRule({
        test: require.resolve('./src/index.js'),
        loader: 'expose-loader',
        options: {
            exposes: 'VirtualMachine'
        }
    });

const playgroundBuilder = webBuilder
    .clone()
    .merge({
        devServer: {
            contentBase: false,
            host: '0.0.0.0',
            port: process.env.PORT || 8073
        },
        performance: {
            hints: false
        },
        entry: {
            'benchmark': './src/playground/benchmark',
            'video-sensing-extension-debug':
                './src/extensions/scratch3_video_sensing/debug',
            'extension-worker': path.join(
                __dirname,
                'src/extension-support/extension-worker.js'
            )
        },
        output: {
            path: path.resolve(__dirname, 'playground'),
            library: {
                name: 'VirtualMachine'
            }
        }
    })
    .addModuleRule({
        test: require.resolve('stats.js/build/stats.min.js'),
        loader: 'script-loader'
    })
    .addModuleRule({
        test: require.resolve(
            './src/extensions/scratch3_video_sensing/debug.js'
        ),
        loader: 'expose-loader',
        options: {
            exposes: 'Scratch3VideoSensingDebug'
        }
    })
    .addModuleRule({
        test: require.resolve('scratch-blocks'),
        loader: 'expose-loader',
        options: {
            exposes: 'Blockly'
        }
    })
    .addModuleRule({
        test: require.resolve('scratch-audio/src/index.js'),
        loader: 'expose-loader',
        options: {
            exposes: 'AudioEngine'
        }
    })
    .addModuleRule({
        test: require.resolve('@scratch/scratch-storage'),
        loader: 'expose-loader',
        options: {
            exposes: 'ScratchStorage ScratchStorage'
        }
    })
    .addModuleRule({
        test: require.resolve('@scratch/scratch-render'),
        loader: 'expose-loader',
        options: {
            exposes: 'ScratchRender'
        }
    })
    .addPlugin(
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: '../../node_modules/scratch-blocks/media',
                    to: 'media'
                },
                {
                    from: '../../node_modules/@scratch/scratch-storage/dist/web'
                },
                {
                    from: '../../node_modules/@scratch/scratch-render/dist/web'
                },
                {
                    from: '../../node_modules/@scratch/scratch-svg-renderer/dist/web'
                },
                {
                    from: 'src/playground'
                }
            ]
        })
    );

module.exports = [
    playgroundBuilder.get(), // webpack-dev-server only looks at the first configuration
    nodeBuilder.get(),
    webBuilder.get()
];
