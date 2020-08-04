/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* Helper function for timeline tests.  Returns an async task that is
 * suitable for use as a particular timeline test.
 * @param string frameScriptName
 *        Base name of the frame script file.
 * @param string url
 *        URL to load.
 */
function makeTimelineTest(frameScriptName, url) {
  info("in timelineTest");
  return async function() {
    info("in in timelineTest");
    waitForExplicitFinish();

    await timelineTestOpenUrl(url);

    const here = "chrome://mochitests/content/browser/docshell/test/browser/";

    let mm = gBrowser.selectedBrowser.messageManager;
    mm.loadFrameScript(here + "frame-head.js", false);
    mm.loadFrameScript(here + frameScriptName, false);

    // Set up some listeners so that timeline tests running in the
    // content process can forward their results to the main process.
    mm.addMessageListener("browser:test:ok", function(message) {
      ok(message.data.value, message.data.message);
    });
    mm.addMessageListener("browser:test:info", function(message) {
      info(message.data.message);
    });
    mm.addMessageListener("browser:test:finish", function(ignore) {
      gBrowser.removeCurrentTab();
      finish();
    });
  };
}

/* Open a URL for a timeline test.  */
function timelineTestOpenUrl(url) {
  window.focus();

  let tabSwitchPromise = new Promise((resolve, reject) => {
    window.gBrowser.addEventListener(
      "TabSwitchDone",
      function() {
        resolve();
      },
      { once: true }
    );
  });

  let loadPromise = new Promise(function(resolve, reject) {
    let browser = window.gBrowser;
    let tab = (browser.selectedTab = BrowserTestUtils.addTab(browser, url));
    let linkedBrowser = tab.linkedBrowser;

    BrowserTestUtils.browserLoaded(linkedBrowser).then(() => resolve(tab));
  });

  return Promise.all([tabSwitchPromise, loadPromise]).then(([_, tab]) => tab);
}

/**
 * Helper function for charset tests. It loads |url| in a new tab,
 * runs |check1| in a ContentTask when the page is ready, switches the
 * charset to |charset|, and then runs |check2| in a ContentTask when
 * the page has finished reloading.
 *
 * |charset| and |check2| can be omitted, in which case the test
 * finishes when |check1| completes.
 */
function runCharsetTest(url, check1, charset, check2) {
  waitForExplicitFinish();

  BrowserTestUtils.openNewForegroundTab(gBrowser, url, true).then(afterOpen);

  function afterOpen() {
    if (charset) {
      BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser).then(
        afterChangeCharset
      );

      SpecialPowers.spawn(gBrowser.selectedBrowser, [], check1).then(() => {
        BrowserSetForcedCharacterSet(charset);
      });
    } else {
      SpecialPowers.spawn(gBrowser.selectedBrowser, [], check1).then(() => {
        gBrowser.removeCurrentTab();
        finish();
      });
    }
  }

  function afterChangeCharset() {
    SpecialPowers.spawn(gBrowser.selectedBrowser, [], check2).then(() => {
      gBrowser.removeCurrentTab();
      finish();
    });
  }
}

async function pushState(url, frameId) {
  info(
    `Doing a pushState, expecting to load ${url} ${
      frameId ? "in an iframe" : ""
    }`
  );
  let browser = gBrowser.selectedBrowser;
  let bc = browser.browsingContext;
  if (frameId) {
    bc = await SpecialPowers.spawn(bc, [frameId], function(id) {
      return content.document.getElementById(id).browsingContext;
    });
  }
  let loaded = BrowserTestUtils.waitForLocationChange(gBrowser, url);
  await SpecialPowers.spawn(bc, [url], function(url) {
    content.history.pushState({}, "", url);
  });
  await loaded;
  info(`Loaded ${url} ${frameId ? "in an iframe" : ""}`);
}

async function loadURI(url) {
  info(`Doing a top-level loadURI, expecting to load ${url}`);
  let browser = gBrowser.selectedBrowser;
  let loaded = BrowserTestUtils.browserLoaded(browser, false, url);
  BrowserTestUtils.loadURI(browser, url);
  await loaded;
  info(`Loaded ${url}`);
}

async function followLink(url, frameId) {
  info(
    `Creating and following a link to ${url} ${frameId ? "in an iframe" : ""}`
  );
  let browser = gBrowser.selectedBrowser;
  let bc = browser.browsingContext;
  if (frameId) {
    bc = await SpecialPowers.spawn(bc, [frameId], function(id) {
      return content.document.getElementById(id).browsingContext;
    });
  }
  let loaded = BrowserTestUtils.browserLoaded(browser, !!frameId, url);
  await SpecialPowers.spawn(bc, [url], function(url) {
    let a = content.document.createElement("a");
    a.href = url;
    content.document.body.appendChild(a);
    a.click();
  });
  await loaded;
  info(`Loaded ${url} ${frameId ? "in an iframe" : ""}`);
}

async function goForward(url, useFrame = false) {
  info(
    `Clicking the forward button, expecting to load ${url} ${
      useFrame ? "in an iframe" : ""
    }`
  );
  let loaded = BrowserTestUtils.waitForLocationChange(gBrowser, url);
  let forwardButton = document.getElementById("forward-button");
  forwardButton.click();
  await loaded;
  info(`Loaded ${url} ${useFrame ? "in an iframe" : ""}`);
}

async function goBack(url, useFrame = false) {
  info(
    `Clicking the back button, expecting to load ${url} ${
      useFrame ? "in an iframe" : ""
    }`
  );
  let loaded = BrowserTestUtils.waitForLocationChange(gBrowser, url);
  let backButton = document.getElementById("back-button");
  backButton.click();
  await loaded;
  info(`Loaded ${url} ${useFrame ? "in an iframe" : ""}`);
}

function assertBackForwardState(canGoBack, canGoForward) {
  let backButton = document.getElementById("back-button");
  let forwardButton = document.getElementById("forward-button");

  is(
    backButton.disabled,
    !canGoBack,
    `${gBrowser.currentURI.spec}: back button is ${
      canGoBack ? "not" : ""
    } disabled`
  );
  is(
    forwardButton.disabled,
    !canGoForward,
    `${gBrowser.currentURI.spec}: forward button is ${
      canGoForward ? "not" : ""
    } disabled`
  );
}
