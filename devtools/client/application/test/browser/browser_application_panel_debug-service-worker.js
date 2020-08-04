/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../debugger/test/mochitest/helpers.js */
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/debugger/test/mochitest/helpers.js",
  this
);

/* import-globals-from ../../../debugger/test/mochitest/helpers/context.js */
Services.scriptloader.loadSubScript(
  "chrome://mochitests/content/browser/devtools/client/debugger/test/mochitest/helpers/context.js",
  this
);

const TAB_URL = URL_ROOT + "resources/service-workers/debug.html";

add_task(async function() {
  await enableApplicationPanel();

  const { panel, tab, target, toolbox } = await openNewTabAndApplicationPanel(
    TAB_URL
  );

  const doc = panel.panelWin.document;

  selectPage(panel, "service-workers");

  info("Wait until the service worker appears in the application panel");
  await waitUntil(() => getWorkerContainers(doc).length === 1);

  const container = getWorkerContainers(doc)[0];
  info("Wait until the debug button is displayed and enabled");
  await waitUntil(() => {
    const button = container.querySelector(".js-debug-button");
    return button && !button.disabled;
  });

  info("Click on the debug button and wait for debugger to be ready");
  const debugButton = container.querySelector(".js-debug-button");
  debugButton.click();
  await waitFor(() => toolbox.getPanel("jsdebugger"));

  // add a breakpoint at line 11
  const debuggerContext = createDebuggerContext(toolbox);
  await waitForLoadedSource(debuggerContext, "debug-sw.js");
  await addBreakpoint(debuggerContext, "debug-sw.js", 11);

  // force a pause at the breakpoint
  info("Invoke fetch, expect the service worker script to pause on line 11");
  await ContentTask.spawn(tab.linkedBrowser, {}, async function() {
    content.wrappedJSObject.fetchFromWorker();
  });
  await waitForPaused(debuggerContext);
  assertPausedLocation(debuggerContext);
  await resume(debuggerContext);

  // remove breakpoint
  const workerScript = findSource(debuggerContext, "debug-sw.js");
  await removeBreakpoint(debuggerContext, workerScript.id, 11);

  await unregisterAllWorkers(target.client, doc);

  // close the tab
  info("Closing the tab.");
  await BrowserTestUtils.removeTab(tab);
});
