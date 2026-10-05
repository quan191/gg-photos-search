module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.agents/',
    '/.claude/',
    '/.codex/',
    '/.opencode/',
    '/plans/',
    '/docs/',
    '/icons/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/.agents/',
    '/.claude/',
    '/.codex/',
    '/.opencode/'
  ]
};
