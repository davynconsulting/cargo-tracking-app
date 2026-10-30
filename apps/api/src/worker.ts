import 'reflect-metadata';
import { loadConfig } from './common/config';
import { createDb, Db } from './db/client';
import { runInvoiceReminders, runSlaChecks } from './exceptions/sla-monitor';
import { FinanceService } from './finance/finance.service';
import { drainOutbox, sendDue } from './notifications/outbox';
import { ChannelSender, LogSender } from './notifications/senders';

/** One pass of everything the worker does. Tests call this directly. */
export async function workerTick(db: Db, sender: ChannelSender, now?: Date) {
  let drained = 0;
  while ((await drainOutbox(db)) > 0) drained++;
  let sent = 0;
  for (let batch = 1; batch > 0; sent += batch) batch = await sendDue(db, sender, now ?? new Date());
  return { drained, sent };
}

export async function periodicTick(db: Db, now = new Date()) {
  const opened = await runSlaChecks(db, now);
  const reminders = await runInvoiceReminders(db, new FinanceService(db), now);
  return { opened, reminders };
}

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.appDatabaseUrl);
  const sender = new LogSender({ whatsappOutage: config.simulateWhatsappOutage });
  let stopping = false;
  let lastPeriodic = 0;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log('Worker started');
  while (!stopping) {
    try {
      await workerTick(db, sender);
      if (Date.now() - lastPeriodic > 60_000) {
        const { opened, reminders } = await periodicTick(db);
        if (opened.length || reminders.length) console.log(`SLA: ${opened.length} exceptions opened; ${reminders.length} reminders queued`);
        lastPeriodic = Date.now();
      }
    } catch (err) {
      console.error('Worker tick failed', err);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  await pool.end();
}

if (require.main === module) main();
