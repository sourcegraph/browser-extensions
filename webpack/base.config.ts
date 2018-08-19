import ExtractTextPlugin from 'extract-text-webpack-plugin'
import HardSourceWebpackPlugin from 'hard-source-webpack-plugin'
import * as path from 'path'
import * as webpack from 'webpack'

const buildEntry = (...files) => files.map(file => path.join(__dirname, file))

const contentEntry = '../pre/content.entry.js'
const backgroundEntry = '../pre/background.entry.js'
const pageEntry = '../pre/page.entry.js'
const extEntry = '../pre/extension.entry.js'

export default {
    entry: {
        background: buildEntry(extEntry, backgroundEntry, '../chrome/extension/background.tsx'),
        link: buildEntry(extEntry, contentEntry, '../chrome/extension/link.tsx'),
        options: buildEntry(extEntry, backgroundEntry, '../chrome/extension/options.tsx'),
        cxp: buildEntry(extEntry, backgroundEntry, '../chrome/extension/cxp.tsx'),
        inject: buildEntry(extEntry, contentEntry, '../chrome/extension/inject.tsx'),
        phabricator: buildEntry(pageEntry, '../app/phabricator/extension.tsx'),

        bootstrap: path.join(__dirname, '../node_modules/bootstrap/dist/css/bootstrap.css'),
        style: path.join(__dirname, '../app/app.scss'),
    },
    output: {
        path: path.join(__dirname, '../build/dist/js'),
        filename: '[name].bundle.js',
        chunkFilename: '[id].chunk.js',
    },
    plugins: [
        new ExtractTextPlugin({
            filename: '../css/[name].bundle.css',
            allChunks: true,
        }),
        new HardSourceWebpackPlugin({
            cachePrune: {
                // Ignore the age of cache entries. Without this, the size of
                // the cache can balloon past the `sizeThreshold`.
                maxAge: 0,
                // The cache size needs to be large enough for the build
                // artifacts, otherwise the cache will get deleted and rendered
                // useless. The build artifacts total ~70MB at the time of
                // writing, so 500MB of cache is plenty.
                sizeThreshold: 500 * 1024 * 1024,
            },
        }),
        new HardSourceWebpackPlugin.ExcludeModulePlugin([
            {
                test: /sass-loader/,
            },
        ]),
    ],
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    'babel-loader',
                    {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                module: 'esnext',
                                noEmit: false, // tsconfig.json sets this to true to avoid output when running tsc manually
                            },
                            transpileOnly: process.env.DISABLE_TYPECHECKING === 'true',
                        },
                    },
                ],
            },
            {
                test: /\.jsx?$/,
                loader: 'babel-loader',
            },
            {
                // sass / scss loader for webpack
                test: /\.(css|sass|scss)$/,
                loader: ExtractTextPlugin.extract([
                    'css-loader',
                    'postcss-loader',
                    {
                        loader: 'sass-loader',
                        options: {
                            includePaths: [__dirname + '/node_modules'],
                        },
                    },
                ]),
            },
        ],
    },
} as webpack.Configuration
