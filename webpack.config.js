const path = require('path');
const DotenvWebpackPlugin = require('dotenv-webpack');
const dotenv = require('dotenv');
const webpack = require('webpack');

// Load environment variables
dotenv.config();

// Generate a unique build ID based on timestamp
const BUILD_ID = Date.now().toString();

module.exports = {
  entry: './src/main.ts',
  mode: 'development',
  devtool: 'source-map',
  target: 'node',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new DotenvWebpackPlugin(),
    new webpack.DefinePlugin({
      'BUILD_ID': JSON.stringify(BUILD_ID)
    })
  ]
};