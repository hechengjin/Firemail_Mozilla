/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Test the ResourceWatcher API around ERROR_MESSAGE
// Reproduces assertions from devtools/shared/webconsole/test/chrome/test_page_errors.html

const {
  ResourceWatcher,
} = require("devtools/shared/resources/resource-watcher");

// Create a simple server so we have a nice sourceName in the resources packets.
const httpServer = createTestHTTPServer();
httpServer.registerPathHandler(`/test_page_errors.html`, (req, res) => {
  res.setStatusLine(req.httpVersion, 200, "OK");
  res.write(`<meta charset=utf8>Test Error Messages`);
});

const TEST_URI = `http://localhost:${httpServer.identity.primaryPort}/test_page_errors.html`;

add_task(async function() {
  // Disable the preloaded process as it creates processes intermittently
  // which forces the emission of RDP requests we aren't correctly waiting for.
  await pushPref("dom.ipc.processPrelaunch.enabled", false);

  info("Test error messages legacy listener");
  await pushPref("devtools.testing.enableServerWatcherSupport", false);
  await testErrorMessagesResources();
  await testErrorMessagesResourcesWithIgnoreExistingResources();

  info("Test error messages server listener");
  await pushPref("devtools.testing.enableServerWatcherSupport", true);
  await testErrorMessagesResources();
  await testErrorMessagesResourcesWithIgnoreExistingResources();
});

async function testErrorMessagesResources() {
  // Open a test tab
  const tab = await addTab(TEST_URI);

  const {
    client,
    resourceWatcher,
    targetList,
  } = await initResourceWatcherAndTarget(tab);

  const receivedMessages = [];
  // The expected messages are the errors, twice (once for cached messages, once for live messages)
  const expectedMessages = Array.from(expectedPageErrors.values()).concat(
    Array.from(expectedPageErrors.values())
  );

  info(
    "Log some errors *before* calling ResourceWatcher.watchResources in order to assert" +
      " the behavior of already existing messages."
  );
  await triggerErrors(tab);

  let done;
  const onAllErrorReceived = new Promise(resolve => (done = resolve));
  const onAvailable = ({ resourceType, targetFront, resource }) => {
    const { pageError } = resource;

    is(
      resource.targetFront,
      targetList.targetFront,
      "The targetFront property is the expected one"
    );

    if (!pageError.sourceName.includes("test_page_errors")) {
      info(`Ignore error from unknown source: "${pageError.sourceName}"`);
      return;
    }

    const index = receivedMessages.length;
    receivedMessages.push(pageError);

    info(`checking received page error #${index}: ${pageError.errorMessage}`);
    ok(pageError, "The resource has a pageError attribute");
    checkObject(pageError, expectedMessages[index]);

    if (receivedMessages.length == expectedMessages.length) {
      done();
    }
  };

  await resourceWatcher.watchResources([ResourceWatcher.TYPES.ERROR_MESSAGE], {
    onAvailable,
  });

  info(
    "Now log errors *after* the call to ResourceWatcher.watchResources and after having" +
      " received all existing messages"
  );
  await BrowserTestUtils.waitForCondition(
    () => receivedMessages.length === expectedPageErrors.size
  );
  await triggerErrors(tab);

  info("Waiting for all expected errors to be received");
  await onAllErrorReceived;
  ok(true, "All the expected errors were received");

  Services.console.reset();
  targetList.stopListening();
  await client.close();
}

async function testErrorMessagesResourcesWithIgnoreExistingResources() {
  info("Test ignoreExistingResources option for ERROR_MESSAGE");
  const tab = await addTab(TEST_URI);

  const {
    client,
    resourceWatcher,
    targetList,
  } = await initResourceWatcherAndTarget(tab);

  info(
    "Check whether onAvailable will not be called with existing error messages"
  );
  await triggerErrors(tab);

  const availableResources = [];
  await resourceWatcher.watchResources([ResourceWatcher.TYPES.ERROR_MESSAGE], {
    onAvailable: ({ resource }) => availableResources.push(resource),
    ignoreExistingResources: true,
  });
  is(
    availableResources.length,
    0,
    "onAvailable wasn't called for existing error messages"
  );

  info(
    "Check whether onAvailable will be called with the future error messages"
  );
  await triggerErrors(tab);

  const expectedMessages = Array.from(expectedPageErrors.values());
  await waitUntil(() => availableResources.length === expectedMessages.length);
  for (let i = 0; i < expectedMessages.length; i++) {
    const { pageError } = availableResources[i];
    const expected = expectedMessages[i];
    checkObject(pageError, expected);
  }

  Services.console.reset();
  await targetList.stopListening();
  await client.close();
}

/**
 * Triggers all the errors in the content page.
 */
async function triggerErrors(tab) {
  for (const [expression, expected] of expectedPageErrors.entries()) {
    if (
      !expected[noUncaughtException] &&
      !Services.appinfo.browserTabsRemoteAutostart
    ) {
      expectUncaughtException();
    }

    await ContentTask.spawn(tab.linkedBrowser, expression, function frameScript(
      expr
    ) {
      const document = content.document;
      const container = document.createElement("script");
      document.body.appendChild(container);
      container.textContent = expr;
      container.remove();
    });
    // Wait a bit between each messages, as uncaught promises errors are not emitted
    // right away.

    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(res => setTimeout(res, 10));
  }
}

const noUncaughtException = Symbol();
const NUMBER_REGEX = /^\d+$/;

const mdnUrl = path =>
  `https://developer.mozilla.org/${path}?utm_source=mozilla&utm_medium=firefox-console-errors&utm_campaign=default`;
const defaultStackFrames = [
  {
    filename: /resource:\/\/testing-common\/content-task.js/,
    lineNumber: NUMBER_REGEX,
    columnNumber: NUMBER_REGEX,
    functionName: "frameScript",
  },
  {
    filename: "resource://testing-common/content-task.js",
    lineNumber: NUMBER_REGEX,
    columnNumber: NUMBER_REGEX,
    functionName: null,
  },
  {
    filename: "resource://testing-common/content-task.js",
    lineNumber: NUMBER_REGEX,
    columnNumber: NUMBER_REGEX,
    functionName: null,
    asyncCause: "MessageListener.receiveMessage",
  },
];

const expectedPageErrors = new Map([
  [
    "document.doTheImpossible();",
    {
      errorMessage: /doTheImpossible/,
      errorMessageName: undefined,
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Not_a_function"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 10,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "(42).toString(0);",
    {
      errorMessage: /radix/,
      errorMessageName: "JSMSG_BAD_RADIX",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl("docs/Web/JavaScript/Reference/Errors/Bad_radix"),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 6,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "'use strict'; (Object.freeze({name: 'Elsa', score: 157})).score = 0;",
    {
      errorMessage: /read.only/,
      errorMessageName: "JSMSG_READ_ONLY",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl("docs/Web/JavaScript/Reference/Errors/Read-only"),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 23,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "([]).length = -1",
    {
      errorMessage: /array length/,
      errorMessageName: "JSMSG_BAD_ARRAY_LENGTH",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Invalid_array_length"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 2,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "'abc'.repeat(-1);",
    {
      errorMessage: /repeat count.*non-negative/,
      errorMessageName: "JSMSG_NEGATIVE_REPETITION_COUNT",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Negative_repetition_count"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: "self-hosted",
          sourceId: null,
          lineNumber: NUMBER_REGEX,
          columnNumber: 1,
          functionName: "repeat",
        },
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 7,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "'a'.repeat(2e28);",
    {
      errorMessage: /repeat count.*less than infinity/,
      errorMessageName: "JSMSG_RESULTING_STRING_TOO_LARGE",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Resulting_string_too_large"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: "self-hosted",
          sourceId: null,
          lineNumber: NUMBER_REGEX,
          columnNumber: 1,
          functionName: "repeat",
        },
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 5,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "77.1234.toExponential(-1);",
    {
      errorMessage: /out of range/,
      errorMessageName: "JSMSG_PRECISION_RANGE",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Precision_range"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 9,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "function a() { return; 1 + 1; }",
    {
      errorMessage: /unreachable code/,
      errorMessageName: "JSMSG_STMT_AFTER_RETURN",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: false,
      warning: true,
      info: false,
      sourceId: null,
      lineText: "function a() { return; 1 + 1; }",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Stmt_after_return"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: null,
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "{let a, a;}",
    {
      errorMessage: /redeclaration of/,
      errorMessageName: "JSMSG_REDECLARED_VAR",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "{let a, a;}",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl(
        "docs/Web/JavaScript/Reference/Errors/Redeclared_parameter"
      ),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: defaultStackFrames,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
      notes: [
        {
          messageBody: /Previously declared at line/,
          frame: {
            source: /test_page_errors/,
          },
        },
      ],
    },
  ],
  [
    `var error = new TypeError("abc");
      error.name = "MyError";
      error.message = "here";
      throw error`,
    {
      errorMessage: /MyError: here/,
      errorMessageName: "",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl("docs/Web/JavaScript/Reference/Errors/Read-only"),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 13,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    "DOMTokenList.prototype.contains.call([])",
    {
      errorMessage: /does not implement interface/,
      errorMessageName: "MSG_METHOD_THIS_DOES_NOT_IMPLEMENT_INTERFACE",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl("docs/Web/JavaScript/Reference/Errors/Read-only"),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 1,
          columnNumber: 33,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: false,
      isForwardedFromContentProcess: false,
    },
  ],
  [
    `
      function promiseThrow() {
        var error2 = new TypeError("abc");
        error2.name = "MyPromiseError";
        error2.message = "here2";
        return Promise.reject(error2);
      }
      promiseThrow()`,
    {
      errorMessage: /MyPromiseError: here2/,
      errorMessageName: "",
      sourceName: /test_page_errors/,
      category: "content javascript",
      timeStamp: NUMBER_REGEX,
      error: true,
      warning: false,
      info: false,
      sourceId: null,
      lineText: "",
      lineNumber: NUMBER_REGEX,
      columnNumber: NUMBER_REGEX,
      exceptionDocURL: mdnUrl("docs/Web/JavaScript/Reference/Errors/Read-only"),
      innerWindowID: NUMBER_REGEX,
      private: false,
      stacktrace: [
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 6,
          columnNumber: 24,
          functionName: "promiseThrow",
        },
        {
          filename: /test_page_errors\.html/,
          sourceId: null,
          lineNumber: 8,
          columnNumber: 7,
          functionName: null,
        },
        ...defaultStackFrames,
      ],
      notes: null,
      chromeContext: false,
      isPromiseRejection: true,
      isForwardedFromContentProcess: false,
      [noUncaughtException]: true,
    },
  ],
]);
