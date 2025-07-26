const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/renderer/index.tsx',
  target: 'electron-renderer',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        include: path.resolve(__dirname, 'src'),
        use: [{ 
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.json')
          }
        }]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js',
    publicPath: '/',
    clean: true
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/renderer/index.html'),
      filename: 'index.html',
      inject: 'body',
      scriptLoading: 'blocking'
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  devServer: {
    port: 3001,
    host: '0.0.0.0', // WSL2 compatibility
    hot: true,
    static: {
      directory: path.resolve(__dirname, 'dist/renderer'),
      publicPath: '/'
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*'
    },
    historyApiFallback: true,
    compress: true,
    allowedHosts: 'all', // WSL2 compatibility
    client: {
      logging: 'info',
      overlay: {
        errors: true,
        warnings: false
      }
    },
    devMiddleware: {
      writeToDisk: false
    }
  }
};