/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const DOC = toDataURL("<div>foo</div>");
const DOC_IFRAME_MULTI = toDataURL(`
  <iframe src='data:text/html,foo'></iframe>
  <iframe src='data:text/html,bar'></iframe>
`);
const DOC_IFRAME_NESTED = toDataURL(`
  <iframe src="${DOC_IFRAME_MULTI}"></iframe>
`);

add_task(async function noEventWhenPageDomainDisabled({ client }) {
  await runLoadEventFiredTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function noEventAfterPageDomainDisabled({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.disable();

  await runLoadEventFiredTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function eventWhenNavigatingWithNoFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runLoadEventFiredTest(client, 1, async () => {
    info("Navigate to a page with no iframes");
    await loadURL(DOC);
  });
});

add_task(async function eventWhenNavigatingWithFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runLoadEventFiredTest(client, 1, async () => {
    info("Navigate to a page with iframes");
    await loadURL(DOC_IFRAME_MULTI);
  });
});

add_task(async function eventWhenNavigatingWithNestedFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runLoadEventFiredTest(client, 1, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

async function runLoadEventFiredTest(client, expectedEventCount, callback) {
  const { Page } = client;

  if (![0, 1].includes(expectedEventCount)) {
    throw new Error(`Invalid value for expectedEventCount`);
  }

  const LOAD_EVENT_FIRED = "Page.loadEventFired";

  const history = new RecordEvents(expectedEventCount);
  history.addRecorder({
    event: Page.loadEventFired,
    eventName: LOAD_EVENT_FIRED,
    messageFn: payload => {
      return `Received ${LOAD_EVENT_FIRED} at time ${payload.timestamp}`;
    },
  });

  const timeStart = Date.now() / 1000;
  await callback();
  const loadEventFiredEvents = await history.record();
  const timeEnd = Date.now() / 1000;

  is(
    loadEventFiredEvents.length,
    expectedEventCount,
    "Got expected amount of loadEventFired events"
  );
  if (expectedEventCount == 0) {
    return;
  }

  const timestamp = loadEventFiredEvents[0].payload.timestamp;
  ok(
    timestamp >= timeStart && timestamp <= timeEnd,
    `Timestamp in expected range [${timeStart} - ${timeEnd}]`
  );
}
