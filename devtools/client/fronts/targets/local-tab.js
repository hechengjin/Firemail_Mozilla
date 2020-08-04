/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const Services = require("Services");
loader.lazyRequireGetter(
  this,
  "gDevTools",
  "devtools/client/framework/devtools",
  true
);
loader.lazyRequireGetter(
  this,
  "TargetFactory",
  "devtools/client/framework/target",
  true
);
loader.lazyRequireGetter(
  this,
  "BrowsingContextTargetFront",
  "devtools/client/fronts/targets/browsing-context",
  true
);

// This represent a Target front for a local tab and includes specialized
// implementation in order to:
// * distinguish local tabs from remote (see target.isLocalTab)
// * being able to hookup into Firefox UI (see Hosts and event listeners of
//   this class)
class LocalTabTargetFront extends BrowsingContextTargetFront {
  constructor(client, targetFront, parentFront, tab) {
    super(client, targetFront, parentFront);

    this._teardownTabListeners = this._teardownTabListeners.bind(this);
    this._handleTabEvent = this._handleTabEvent.bind(this);

    // This flag will be set true from DevToolsExtensionPageContextParent
    // if this target is created for DevTools extension page.
    this.isDevToolsExtensionContext = false;

    this._tab = tab;
    this._setupTabListeners();

    this.once("close", this._teardownTabListeners);
  }

  get isLocalTab() {
    return true;
  }
  get localTab() {
    return this._tab;
  }
  toString() {
    return `Target:${this.localTab}`;
  }

  /**
   * Listen to the different events.
   */
  _setupTabListeners() {
    this.localTab.addEventListener("TabClose", this._handleTabEvent);
    this.localTab.addEventListener("TabRemotenessChange", this._handleTabEvent);
  }

  /**
   * Teardown event listeners.
   */
  _teardownTabListeners() {
    this.localTab.removeEventListener("TabClose", this._handleTabEvent);
    this.localTab.removeEventListener(
      "TabRemotenessChange",
      this._handleTabEvent
    );
  }

  /**
   * Handle tabs events.
   */
  async _handleTabEvent(event) {
    switch (event.type) {
      case "TabClose":
        // Always destroy the toolbox opened for this local tab target.
        // Toolboxes are no longer destroyed on target destruction.
        // When the toolbox is in a Window Host, it won't be removed from the
        // DOM when the tab is closed.
        const toolbox = gDevTools.getToolbox(this);
        // A few tests are using TargetFactory.forTab, but aren't spawning any
        // toolbox. In this case, the toobox won't destroy the target, so we
        // do it from here. But ultimately, the target should destroy itself
        // from the actor side anyway.
        if (toolbox) {
          // Toolbox.destroy will call target.destroy eventually.
          await toolbox.destroy();
        }
        break;
      case "TabRemotenessChange":
        this._onRemotenessChange();
        break;
    }
  }

  /**
   * Automatically respawn the toolbox when the tab changes between being
   * loaded within the parent process and loaded from a content process.
   * Process change can go in both ways.
   */
  async _onRemotenessChange() {
    // Responsive design does a crazy dance around tabs and triggers
    // remotenesschange events. But we should ignore them as at the end
    // the content doesn't change its remoteness.
    if (this.localTab.isResponsiveDesignMode) {
      return;
    }

    // The front that was created for DevTools page extension does not have corresponding toolbox.
    if (this.isDevToolsExtensionContext) {
      return;
    }

    const toolbox = gDevTools.getToolbox(this);

    const targetSwitchingEnabled = Services.prefs.getBoolPref(
      "devtools.target-switching.enabled",
      false
    );

    // When target switching is enabled, everything is handled by the TargetList
    // In a near future, this client side code should be replaced by actor code,
    // notifying about new tab targets.
    if (targetSwitchingEnabled) {
      this.emit("remoteness-change", this);
      return;
    }

    // Otherwise, if we don't support target switching, ensure the toolbox is destroyed.
    // We need to wait for the toolbox destruction because the TargetFactory memoized the targets,
    // and only cleans up the cache after the target is destroyed via toolbox destruction.
    await toolbox.destroy();

    // Fetch the new target for this tab
    const newTarget = await TargetFactory.forTab(this.localTab, null);

    gDevTools.showToolbox(newTarget);
  }
}
exports.LocalTabTargetFront = LocalTabTargetFront;
