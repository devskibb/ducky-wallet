// webpack.config.js

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');


module.exports = {
    entry: {
      popup: './src/popup.js',
      background: './src/background.js',
      contentScript: './src/contentScript.js',
      injectedScript: './src/injectedScript.js',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        // Existing rules
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false, // Allow imports without extensions
          },
        },
        // Add new rules for 3D files
        {
          test: /\.(fbx|bin)$/,
          type: 'asset/resource',
          generator: {
            filename: 'source/[name][ext]'
          }
        },
        {
          test: /\.(png|jpg|jpeg)$/,
          type: 'asset/resource',
          generator: {
            filename: 'textures/[name][ext]'
          }
        }
      ],
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      fallback: {
        buffer: require.resolve('buffer/'),
        process: require.resolve('process/browser.js'),
        stream: require.resolve('stream-browserify'),
        crypto: require.resolve('crypto-browserify'),
        assert: require.resolve('assert/'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify/browser'),
        url: require.resolve('url/'),
      },
      alias: {
        'three': path.resolve('./node_modules/three')
      }
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'src/manifest.json', to: 'manifest.json' },
          { from: 'src/popup.html', to: 'popup.html' },
          { from: 'src/styles.css', to: 'styles.css' },
          { from: 'src/icons', to: 'icons' },
          { from: 'data', to: 'data' },
          // Add new patterns for 3D files
          { 
            from: 'source',
            to: 'source',
            noErrorOnMissing: true
          },
          { 
            from: 'textures',
            to: 'textures',
            noErrorOnMissing: true
          }
        ],
      }),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
      }),
      new NodePolyfillPlugin(), // Automatically polyfill Node.js core modules
    ],
    optimization: {
      concatenateModules: false, // Disable module concatenation
    },
    mode: 'production',
  };
  
