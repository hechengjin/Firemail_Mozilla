/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_policy_disable_forget_button() {
  let widget = CustomizableUI.getWidget("panic-button");
  isnot(widget.type, "view", "Forget Button was not created");
});
