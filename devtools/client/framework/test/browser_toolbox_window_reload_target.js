/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Test that pressing various page reload keyboard shortcuts always works when devtools
// has focus, no matter if it's undocked or docked, and whatever the tool selected (this
// is to avoid tools from overriding the page reload shortcuts).
// This test also serves as a safety net checking that tools just don't explode when the
// page is reloaded.
// It is therefore quite long to run.

requestLongerTimeout(10);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/PromiseTestUtils.jsm"
);

// allow a context error because it is harmless. This could likely be removed in the next patch because it is a symptom of events coming from the target-list and debugger targets module...
PromiseTestUtils.allowMatchingRejectionsGlobally(/Page has navigated/);

const TEST_URL =
  "data:text/html;charset=utf-8," +
  "<html><head><title>Test reload</title></head>" +
  "<body><h1>Testing reload from devtools</h1></body></html>";

const { Toolbox } = require("devtools/client/framework/toolbox");
const { LocalizationHelper } = require("devtools/shared/l10n");
const L10N = new LocalizationHelper(
  "devtools/client/locales/toolbox.properties"
);

// Track how many page reloads we've sent to the page.
var reloadsSent = 0;

add_task(async function() {
  await addTab(TEST_URL);
  const target = await TargetFactory.forTab(gBrowser.selectedTab);

  info("Getting the entire list of tools supported in this tab");
  const toolIDs = gDevTools
    .getToolDefinitionArray()
    .filter(def => def.isTargetSupported(target))
    .map(def => def.id);

  info(
    "Display the toolbox, docked at the bottom, with the first tool selected"
  );
  const toolbox = await gDevTools.showToolbox(
    target,
    toolIDs[0],
    Toolbox.HostType.BOTTOM
  );

  info(
    "Listen to page reloads to check that they are indeed sent by the toolbox"
  );
  let reloadDetected = 0;
  const reloadCounter = msg => {
    reloadDetected++;
    info("Detected reload #" + reloadDetected);
    is(
      reloadDetected,
      reloadsSent,
      "Detected the right number of reloads in the page"
    );
  };

  const removeLoadListener = BrowserTestUtils.addContentEventListener(
    gBrowser.selectedBrowser,
    "load",
    reloadCounter,
    {}
  );

  info("Start testing with the toolbox docked");
  // Note that we actually only test 1 tool in docked mode, to cut down on test time.
  await testOneTool(toolbox, toolIDs[toolIDs.length - 1]);

  info("Switch to undocked mode");
  await toolbox.switchHost(Toolbox.HostType.WINDOW);
  toolbox.win.focus();

  info("Now test with the toolbox undocked");
  for (const toolID of toolIDs) {
    await testOneTool(toolbox, toolID);
  }

  info("Switch back to docked mode");
  await toolbox.switchHost(Toolbox.HostType.BOTTOM);

  removeLoadListener();

  await toolbox.destroy();
  gBrowser.removeCurrentTab();
});

async function testOneTool(toolbox, toolID) {
  info(`Select tool ${toolID}`);
  await toolbox.selectTool(toolID);

  await testReload("toolbox.reload.key", toolbox);
  await testReload("toolbox.reload2.key", toolbox);
  await testReload("toolbox.forceReload.key", toolbox);
  await testReload("toolbox.forceReload2.key", toolbox);
}

async function testReload(shortcut, toolbox) {
  info(`Reload with ${shortcut}`);

  const walker = (await toolbox.target.getFront("inspector")).walker;

  const observer = {
    _isDocumentUnloaded: false,
    _isNewRooted: false,
    onRootDestroyed(mutations) {
      this._isDocumentUnloaded = true;
    },
    onNewRootNode() {
      this._isNewRooted = true;
    },
    isReady() {
      return this._isDocumentUnloaded && this._isNewRooted;
    },
  };

  observer.onRootDestroyed = observer.onRootDestroyed.bind(observer);
  observer.onNewRootNode = observer.onNewRootNode.bind(observer);
  walker.on("root-destroyed", observer.onRootDestroyed);
  walker.watchRootNode(observer.onNewRootNode);

  // If we have a jsdebugger panel, wait for it to complete its reload
  const jsdebugger = toolbox.getPanel("jsdebugger");
  let onReloaded = Promise.resolve;
  if (jsdebugger) {
    onReloaded = jsdebugger.once("reloaded");
  }

  const loadPromise = BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);

  toolbox.win.focus();
  synthesizeKeyShortcut(L10N.getStr(shortcut), toolbox.win);
  reloadsSent++;

  await loadPromise;

  // Wait for root-destroyed and root-available to be fired.
  await waitUntil(() => observer.isReady());
  walker.off("root-destroyed", observer.onRootDestroyed);
  walker.unwatchRootNode(observer.onNewRootNode);
  await onReloaded;
}
