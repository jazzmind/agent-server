import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';

// Create memory configuration for agents
export const memoryConfig = new Memory({
  storage: new PostgresStore({
    connectionString: process.env.DATABASE_URL!,
  }),
  // vector: new PgVector({
  //   connectionString: process.env.DATABASE_URL!,
  // }),
  options: {
    // Disable semantic recall for now since embedder is not configured
    // semanticRecall: {
    //   topK: 5,
    //   messageRange: 10,
    // },
    workingMemory: {
      enabled: true,
    },
  },
});
