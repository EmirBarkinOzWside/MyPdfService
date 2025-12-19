const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Chrome'u projenin ana dizinindeki .cache klasörüne indir
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};