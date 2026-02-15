const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname, './'),
};

module.exports = nextConfig;
