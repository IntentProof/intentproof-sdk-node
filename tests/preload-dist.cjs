/**
 * Redirect SDK imports to compiled dist/ for accurate V8 coverage.
 */
const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (
    typeof request === 'string' &&
    (request.startsWith('../src/') || request === '../src/index')
  ) {
    const mapped = request.replace('../src/', '../dist/');
    return originalResolveFilename.call(
      this,
      mapped,
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
