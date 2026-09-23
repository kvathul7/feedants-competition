import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let memoryServer = null;

/**
 * Connects to MongoDB.
 *
 * If MONGODB_URI is not supplied we spin up an in-process replica set via
 * mongodb-memory-server. This keeps the assignment runnable with zero infra,
 * while still exercising the same transaction semantics as a real cluster.
 */
export async function connectDatabase() {
  let uri = env.mongoUri;

  if (!uri) {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    logger.info('No MONGODB_URI set - starting in-memory MongoDB replica set...');
    memoryServer = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    uri = memoryServer.getUri();
    logger.info('In-memory MongoDB ready (data is discarded on shutdown)');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    dbName: env.mongoDbName,
    // Keep the pool generous: seat booking is short-lived but write-heavy.
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
    retryWrites: true,
  });

  logger.info(`MongoDB connected (db: ${env.mongoDbName})`);
  return mongoose.connection;
}

/** True when the deployment supports multi-document transactions. */
export function supportsTransactions() {
  const topology = mongoose.connection?.client?.topology;
  if (!topology) return false;
  const type = topology.description?.type;
  return type === 'ReplicaSetWithPrimary' || type === 'Sharded' || Boolean(memoryServer);
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServer) await memoryServer.stop();
}
