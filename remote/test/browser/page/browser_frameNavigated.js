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
  await runFrameNavigatedTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function noEventAfterPageDomainDisabled({ client }) {
  const { Page } = client;

  await Page.enable();
  await Page.disable();

  await runFrameNavigatedTest(client, 0, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

add_task(async function eventWhenNavigatingWithNoFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runFrameNavigatedTest(client, 1, async () => {
    info("Navigate to a page with no iframes");
    await loadURL(DOC);
  });
});

add_task(async function eventsWhenNavigatingWithFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runFrameNavigatedTest(client, 3, async () => {
    info("Navigate to a page with iframes");
    await loadURL(DOC_IFRAME_MULTI);
  });
});

add_task(async function eventWhenNavigatingWithNestedFrames({ client }) {
  const { Page } = client;

  await Page.enable();

  await runFrameNavigatedTest(client, 4, async () => {
    info("Navigate to a page with nested iframes");
    await loadURL(DOC_IFRAME_NESTED);
  });
});

async function runFrameNavigatedTest(client, expectedEventCount, callback) {
  const { Page } = client;

  const NAVIGATED = "Page.frameNavigated";

  const history = new RecordEvents(expectedEventCount);
  history.addRecorder({
    event: Page.frameNavigated,
    eventName: NAVIGATED,
    messageFn: payload => {
      return `Received ${NAVIGATED} for frame id ${payload.frame.id}`;
    },
  });

  await callback();

  const frameNavigatedEvents = await history.record();

  is(
    frameNavigatedEvents.length,
    expectedEventCount,
    "Got expected amount of frameNavigated events"
  );
  if (expectedEventCount == 0) {
    return;
  }

  const frames = await getFlattenedFrameTree(client);

  frameNavigatedEvents.forEach(({ payload }) => {
    const { frame } = payload;

    const expectedFrame = frames.get(frame.id);
    Assert.deepEqual(frame, expectedFrame, "Got expected frame details");
  });
}
