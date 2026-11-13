// Tests start a throwaway MongoDB in memory (tests/db.js), which takes a few seconds.
export default {
  test: {
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
};
