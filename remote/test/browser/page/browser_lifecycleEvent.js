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

const PAGE_URL =
  "http://example.com/browser/remote/test/browser/page/doc_empty.html";

add_task(async function noEventsWhenPageDomainDisabled({ client }) {
  await runPageLifecycleTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function noEventAfterPageDomainDisabled({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.disable();

  await runPageLifecycleTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function noEventWhenLifeCycleDisabled({ client }) {
  const { Page } = client;

  await Page.enable();

  await runPageLifecycleTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function noEventAfterLifeCycleDisabled({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });
  await Page.setLifecycleEventsEnabled({ enabled: false });

  await runPageLifecycleTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function eventsWhenNavigatingWithNoFrames({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 1, async () => {
    info("Navigate to a page with no iframes");
    await loadURL(DOC);
  });
});

add_task(async function eventsWhenNavigatingToURLWithNoFrames({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 1, async () => {
    info("Navigate to a URL with no frames");
    await loadURL(PAGE_URL);
  });
});

add_task(async function eventsWhenNavigatingToSameURLWithNoFrames({ client }) {
  const { Page } = client;

  info("Navigate to a page with no iframes");
  await loadURL(PAGE_URL);

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 1, async () => {
    info("Navigate to the same page with no iframes");
    await loadURL(PAGE_URL);
  });
});

add_task(async function eventsWhenReloadingSameURLWithNoFrames({ client }) {
  const { Page } = client;

  info("Navigate to a page with no iframes");
  await loadURL(PAGE_URL);

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 1, async () => {
    info("Reload page with no iframes");
    const pageLoaded = Page.loadEventFired();
    await Page.reload();
    await pageLoaded;
  });
});

add_task(async function eventsWhenNavigatingWithFrames({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 3, async () => {
    info("Navigate to a page with iframes");
    await loadURL(DOC_IFRAME_MULTI);
  });
});

add_task(async function eventsWhenNavigatingWithNestedFrames({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.setLifecycleEventsEnabled({ enabled: true });

  await runPageLifecycleTest(client, 4, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

async function runPageLifecycleTest(client, expectedEventSets, callback) {
  const { Page } = client;

  const LIFECYCLE = "Page.lifecycleEvent";
  const LIFECYCLE_EVENTS = ["init", "DOMContentLoaded", "load"];

  const expectedEventCount = expectedEventSets * LIFECYCLE_EVENTS.length;
  const history = new RecordEvents(expectedEventCount);
  history.addRecorder({
    event: Page.lifecycleEvent,
    eventName: LIFECYCLE,
    messageFn: payload => {
      return (
        `Received "${payload.name}" ${LIFECYCLE} ` +
        `for frame id ${payload.frameId}`
      );
    },
  });

  await callback();

  const flattenedFrameTree = await getFlattenedFrameTree(client);

  const lifecycleEvents = await history.record();
  is(
    lifecycleEvents.length,
    expectedEventCount,
    "Got expected amount of lifecycle events"
  );

  if (expectedEventCount == 0) {
    return;
  }

  // Check lifecycle events for each frame
  for (const frame of flattenedFrameTree.values()) {
    info(`Check frame id ${frame.id}`);

    const frameEvents = lifecycleEvents.filter(({ payload }) => {
      return payload.frameId == frame.id;
    });

    Assert.deepEqual(
      frameEvents.map(event => event.payload.name),
      LIFECYCLE_EVENTS,
      "Received various lifecycle events in the expected order"
    );

    // Check data as exposed by each of these events
    let lastTimestamp = lifecycleEvents[0].payload.timestamp;
    lifecycleEvents.forEach(({ payload }, index) => {
      ok(
        payload.timestamp >= lastTimestamp,
        "timestamp succeeds the one from the former event"
      );
      lastTimestamp = payload.timestamp;

      // Bug 1632007 return a loaderId for data: url
      if (frame.url.startsWith("data:")) {
        todo(!!payload.loaderId, "Event has a loaderId");
      } else {
        is(payload.loaderId, frame.loaderId, `event has expected loaderId`);
      }
    });
  }
}
