/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

const { shallow } = require("enzyme");
const { REPS, getRep } = require("../rep");
const { Rep, RegExp } = REPS;
const { ELLIPSIS } = require("../rep-utils");
const stubs = require("../stubs/regexp");
const { expectActorAttribute } = require("./test-helpers");

describe("test RegExp", () => {
  const stub = stubs.get("RegExp");

  it("selects RegExp Rep", () => {
    expect(getRep(stub)).toEqual(RegExp.rep);
  });

  it("renders with expected text content", () => {
    const renderedComponent = shallow(
      Rep({
        object: stub,
        shouldRenderTooltip: true,
      })
    );

    expect(renderedComponent.text()).toEqual("/ab+c/i");
    expect(renderedComponent.prop("title")).toEqual("/ab+c/i");
    expectActorAttribute(renderedComponent, stub.actor);
  });

  it("renders regexp with longString displayString with expected text content", () => {
    const longStringDisplayStringRegexpStub = stubs.get(
      "longString displayString RegExp"
    );
    const renderedComponent = shallow(
      Rep({
        object: longStringDisplayStringRegexpStub,
      })
    );

    expect(renderedComponent.text()).toEqual(
      `/${"ab ".repeat(333)}${ELLIPSIS}`
    );
    expectActorAttribute(
      renderedComponent,
      longStringDisplayStringRegexpStub.actor
    );
  });
});
