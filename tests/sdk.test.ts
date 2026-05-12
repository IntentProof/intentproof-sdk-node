import { wrap, runWithCorrelationId, configure, getOutbox } from '../src/index';

configure({ dbPath: './test.db' });

async function main() {
    const refund = wrap(
        { intent: "Return funds", action: "payments.refund" },
        async (amount: number) => ({ id: "ref_123", amount })
    );

    await runWithCorrelationId("test-123", async () => {
        await refund(4999);
    });

    const events = await getOutbox().getEvents();
    console.log("EVENTS IN OUTBOX:", events.length);
    if (events.length > 0 && events[0].signature) {
        console.log("Event is signed:", events[0].signature.value !== undefined);
        console.log("Event payload:", JSON.stringify(events[0], null, 2));
    }
}

// Ensure the table is created before inserting
setTimeout(() => {
    main().catch(console.error);
}, 100);
