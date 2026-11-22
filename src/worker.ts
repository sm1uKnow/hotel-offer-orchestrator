import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { taskQueue, temporalAddress } from './config';

async function main(): Promise<void> {
  const connection = await NativeConnection.connect({ address: temporalAddress });
  try {
    const worker = await Worker.create({
      connection,
      taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });
    await worker.run();
  } finally {
    await connection.close();
  }
}

void main().catch((error) => {
  console.error('Temporal worker failed', error);
  process.exitCode = 1;
});
