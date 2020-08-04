/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const protocol = require("devtools/shared/protocol");
const { components, Cr } = require("chrome");

const testErrorsSpec = protocol.generateActorSpec({
  typeName: "testErrors",

  methods: {
    throwsComponentsException: {
      request: {},
      response: {},
    },
    throwsException: {
      request: {},
      response: {},
    },
    throwsJSError: {
      request: {},
      response: {},
    },
  },
});

const TestErrorsActor = protocol.ActorClassWithSpec(testErrorsSpec, {
  initialize: function(conn) {
    protocol.Actor.prototype.initialize.call(this, conn);
    this.conn = conn;
  },

  throwsComponentsException: async function() {
    throw components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  throwsException: async function() {
    return this.a.b.c;
  },

  throwsJSError: async function() {
    throw new Error("JSError");
  },
});
exports.TestErrorsActor = TestErrorsActor;

class TestErrorsFront extends protocol.FrontClassWithSpec(testErrorsSpec) {
  constructor(client) {
    super(client);
    this.formAttributeName = "testErrorsActor";
  }
}
protocol.registerFront(TestErrorsFront);
