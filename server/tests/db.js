import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Every test file gets its own throwaway MongoDB in memory, emptied before each test.
// (Testing tool only: the real app uses MONGODB_URI.)
export function useTestDatabase() {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  beforeEach(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
}
