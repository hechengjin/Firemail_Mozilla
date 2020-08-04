/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EventEmitter = require("devtools/shared/event-emitter");

loader.lazyRequireGetter(
  this,
  "CombinedProgress",
  "devtools/client/accessibility/utils/audit",
  true
);

const {
  accessibility: { AUDIT_TYPE },
} = require("devtools/shared/constants");
const { FILTERS } = require("devtools/client/accessibility/constants");

/**
 * Component responsible for tracking all Accessibility fronts in parent and
 * content processes.
 */
class AccessibilityProxy {
  constructor(toolbox) {
    this.toolbox = toolbox;

    this._accessibilityWalkerFronts = new Set();
    this.lifecycleEvents = new Map();
    this.accessibilityEvents = new Map();
    this._updateTargetListeners = new EventEmitter();
    this.supports = {};

    this.audit = this.audit.bind(this);
    this.enableAccessibility = this.enableAccessibility.bind(this);
    this.getAccessibilityTreeRoot = this.getAccessibilityTreeRoot.bind(this);
    this.resetAccessiblity = this.resetAccessiblity.bind(this);
    this.startListeningForAccessibilityEvents = this.startListeningForAccessibilityEvents.bind(
      this
    );
    this.startListeningForLifecycleEvents = this.startListeningForLifecycleEvents.bind(
      this
    );
    this.startListeningForParentLifecycleEvents = this.startListeningForParentLifecycleEvents.bind(
      this
    );
    this.startListeningForTargetUpdated = this.startListeningForTargetUpdated.bind(
      this
    );
    this.stopListeningForAccessibilityEvents = this.stopListeningForAccessibilityEvents.bind(
      this
    );
    this.stopListeningForLifecycleEvents = this.stopListeningForLifecycleEvents.bind(
      this
    );
    this.stopListeningForParentLifecycleEvents = this.stopListeningForParentLifecycleEvents.bind(
      this
    );
    this.stopListeningForTargetUpdated = this.stopListeningForTargetUpdated.bind(
      this
    );
    this.highlightAccessible = this.highlightAccessible.bind(this);
    this.unhighlightAccessible = this.unhighlightAccessible.bind(this);
    this.onTargetAvailable = this.onTargetAvailable.bind(this);
    this.onTargetDestroyed = this.onTargetDestroyed.bind(this);
    this.onAccessibilityFrontAvailable = this.onAccessibilityFrontAvailable.bind(
      this
    );
    this.onAccessibilityFrontDestroyed = this.onAccessibilityFrontDestroyed.bind(
      this
    );
    this.onAccessibleWalkerFrontAvailable = this.onAccessibleWalkerFrontAvailable.bind(
      this
    );
    this.onAccessibleWalkerFrontDestroyed = this.onAccessibleWalkerFrontDestroyed.bind(
      this
    );
    this.unhighlightBeforeCalling = this.unhighlightBeforeCalling.bind(this);
  }

  get enabled() {
    return this.accessibilityFront && this.accessibilityFront.enabled;
  }

  /**
   * Indicates whether the accessibility service is enabled.
   */
  get canBeEnabled() {
    return this.parentAccessibilityFront.canBeEnabled;
  }

  get currentTarget() {
    return this.toolbox.targetList.targetFront;
  }

  /**
   * Perform an audit for a given filter.
   *
   * @param  {String} filter
   *         Type of an audit to perform.
   * @param  {Function} onProgress
   *         Audit progress callback.
   *
   * @return {Promise}
   *         Resolves when the audit for every document, that each of the frame
   *         accessibility walkers traverse, completes.
   */
  async audit(filter, onProgress) {
    const types = filter === FILTERS.ALL ? Object.values(AUDIT_TYPE) : [filter];
    const totalFrames = this.toolbox.targetList.getAllTargets([
      this.toolbox.targetList.TYPES.FRAME,
    ]).length;
    const progress = new CombinedProgress({
      onProgress,
      totalFrames,
    });
    const audits = await this.withAllAccessibilityWalkerFronts(
      async accessibleWalkerFront =>
        accessibleWalkerFront.audit({
          types,
          onProgress: progress.onProgressForWalker.bind(
            progress,
            accessibleWalkerFront
          ),
        })
    );

    // Accumulate all audits into a single structure.
    const combinedAudit = { ancestries: [] };
    for (const audit of audits) {
      // If any of the audits resulted in an error, no need to continue.
      if (audit.error) {
        return audit;
      }

      combinedAudit.ancestries.push(...audit.ancestries);
    }

    return combinedAudit;
  }

  startListeningForTargetUpdated(onTargetUpdated) {
    this._updateTargetListeners.on("target-updated", onTargetUpdated);
  }

  stopListeningForTargetUpdated(onTargetUpdated) {
    this._updateTargetListeners.off("target-updated", onTargetUpdated);
  }

  async enableAccessibility() {
    // Accessibility service is initialized using the parent accessibility
    // front. That, in turn, initializes accessibility service in all content
    // processes. We need to wait until that happens to be sure platform
    // accessibility is fully enabled.
    const enabled = this.accessibilityFront.once("init");
    await this.parentAccessibilityFront.enable();
    await enabled;
  }

  /**
   * Return the topmost level accessibility walker to be used as the root of
   * the accessibility tree view.
   *
   * @return {Object}
   *         Topmost accessibility walker.
   */
  getAccessibilityTreeRoot() {
    return this.accessibilityFront.accessibleWalkerFront;
  }

  /**
   * Look up accessibility fronts (get an existing one or create a new one) for
   * all existing target fronts and run a task with each one of them.
   * @param {Function} task
   *        Function to execute with each accessiblity front.
   */
  async withAllAccessibilityFronts(taskFn) {
    const accessibilityFronts = await this.toolbox.targetList.getAllFronts(
      this.toolbox.targetList.TYPES.FRAME,
      "accessibility"
    );
    const tasks = [];
    for (const accessibilityFront of accessibilityFronts) {
      tasks.push(taskFn(accessibilityFront));
    }

    return Promise.all(tasks);
  }

  /**
   * Look up accessibility walker fronts (get an existing one or create a new
   * one using accessibility front) for all existing target fronts and run a
   * task with each one of them.
   * @param {Function} task
   *        Function to execute with each accessiblity walker front.
   */
  withAllAccessibilityWalkerFronts(taskFn) {
    return this.withAllAccessibilityFronts(async accessibilityFront => {
      if (!accessibilityFront.accessibleWalkerFront) {
        await accessibilityFront.bootstrap();
      }

      return taskFn(accessibilityFront.accessibleWalkerFront);
    });
  }

  /**
   * Unhighlight previous accessible object if we switched between processes and
   * call the appropriate event handler.
   */
  unhighlightBeforeCalling(listener) {
    return async accessible => {
      if (accessible) {
        const accessibleWalkerFront = accessible.getParent();
        if (this._currentAccessibleWalkerFront !== accessibleWalkerFront) {
          if (this._currentAccessibleWalkerFront) {
            await this._currentAccessibleWalkerFront.unhighlight();
          }

          this._currentAccessibleWalkerFront = accessibleWalkerFront;
        }
      }

      await listener(accessible);
    };
  }

  /**
   * Start picking and add walker listeners.
   * @param  {Boolean} doFocus
   *         If true, move keyboard focus into content.
   */
  pick(doFocus, onHovered, onPicked, onPreviewed, onCanceled) {
    return this.withAllAccessibilityWalkerFronts(
      async accessibleWalkerFront => {
        this.startListening(accessibleWalkerFront, {
          events: {
            "picker-accessible-hovered": this.unhighlightBeforeCalling(
              onHovered
            ),
            "picker-accessible-picked": this.unhighlightBeforeCalling(onPicked),
            "picker-accessible-previewed": this.unhighlightBeforeCalling(
              onPreviewed
            ),
            "picker-accessible-canceled": this.unhighlightBeforeCalling(
              onCanceled
            ),
          },
          // Only register listeners once (for top level), no need to register
          // them for all walkers again and again.
          register: accessibleWalkerFront.targetFront.isTopLevel,
        });
        await accessibleWalkerFront.pick(
          // Only pass doFocus to the top level accessibility walker front.
          doFocus && accessibleWalkerFront.targetFront.isTopLevel
        );
      }
    );
  }

  /**
   * Stop picking and remove all walker listeners.
   */
  async cancelPick() {
    this._currentAccessibleWalkerFront = null;
    return this.withAllAccessibilityWalkerFronts(
      async accessibleWalkerFront => {
        await accessibleWalkerFront.cancelPick();
        this.stopListening(accessibleWalkerFront, {
          events: {
            "picker-accessible-hovered": null,
            "picker-accessible-picked": null,
            "picker-accessible-previewed": null,
            "picker-accessible-canceled": null,
          },
          // Only unregister listeners once (for top level), no need to
          // unregister them for all walkers again and again.
          unregister: accessibleWalkerFront.targetFront.isTopLevel,
        });
      }
    );
  }

  async resetAccessiblity() {
    const { enabled } = this.accessibilityFront;
    const { canBeEnabled, canBeDisabled } = this.parentAccessibilityFront;
    return { enabled, canBeDisabled, canBeEnabled };
  }

  startListening(front, { events, register = false } = {}) {
    for (const [type, listener] of Object.entries(events)) {
      front.on(type, listener);
      if (register) {
        this.registerEvent(front, type, listener);
      }
    }
  }

  stopListening(front, { events, unregister = false } = {}) {
    for (const [type, listener] of Object.entries(events)) {
      front.off(type, listener);
      if (unregister) {
        this.unregisterEvent(front, type, listener);
      }
    }
  }

  startListeningForAccessibilityEvents(events) {
    for (const accessibleWalkerFront of this._accessibilityWalkerFronts.values()) {
      this.startListening(accessibleWalkerFront, {
        events,
        // Only register listeners once (for top level), no need to register
        // them for all walkers again and again.
        register: accessibleWalkerFront.targetFront.isTopLevel,
      });
    }
  }

  stopListeningForAccessibilityEvents(events) {
    for (const accessibleWalkerFront of this._accessibilityWalkerFronts.values()) {
      this.stopListening(accessibleWalkerFront, {
        events,
        // Only unregister listeners once (for top level), no need to unregister
        // them for all walkers again and again.
        unregister: accessibleWalkerFront.targetFront.isTopLevel,
      });
    }
  }

  startListeningForLifecycleEvents(events) {
    this.startListening(this.accessibilityFront, { events, register: true });
  }

  stopListeningForLifecycleEvents(events) {
    this.stopListening(this.accessibilityFront, { events, unregister: true });
  }

  startListeningForParentLifecycleEvents(events) {
    this.startListening(this.parentAccessibilityFront, {
      events,
      register: false,
    });
  }

  stopListeningForParentLifecycleEvents(events) {
    this.stopListening(this.parentAccessibilityFront, {
      events,
      unregister: false,
    });
  }

  highlightAccessible(accessibleFront, options) {
    if (!accessibleFront) {
      return;
    }

    const accessibleWalkerFront = accessibleFront.getParent();
    if (!accessibleWalkerFront) {
      return;
    }

    accessibleWalkerFront
      .highlightAccessible(accessibleFront, options)
      .catch(error => {
        // Only report an error where there's still a toolbox. Ignore cases
        // where toolbox is already destroyed.
        if (this.toolbox) {
          console.error(error);
        }
      });
  }

  unhighlightAccessible(accessibleFront) {
    if (!accessibleFront) {
      return;
    }

    const accessibleWalkerFront = accessibleFront.getParent();
    if (!accessibleWalkerFront) {
      return;
    }

    accessibleWalkerFront.unhighlight().catch(error => {
      // Only report an error where there's still a toolbox. Ignore cases
      // where toolbox is already destroyed.
      if (this.toolbox) {
        console.error(error);
      }
    });
  }

  async initialize() {
    await this.toolbox.targetList.watchTargets(
      [this.toolbox.targetList.TYPES.FRAME],
      this.onTargetAvailable,
      this.onTargetDestroyed
    );
    this.parentAccessibilityFront = await this.toolbox.targetList.rootFront.getFront(
      "parentaccessibility"
    );
  }

  destroy() {
    this.toolbox.targetList.unwatchTargets(
      [this.toolbox.targetList.TYPES.FRAME],
      this.onTargetAvailable,
      this.onTargetDestroyed
    );

    this.lifecycleEvents.clear();
    this.accessibilityEvents.clear();
    this._updateTargetListeners = null;

    this.accessibilityFront = null;
    this.parentAccessibilityFront = null;
    this.simulatorFront = null;
    this.simulate = null;
    this.toolbox = null;
  }

  _getEvents(front) {
    return front.typeName === "accessiblewalker"
      ? this.accessibilityEvents
      : this.lifecycleEvents;
  }

  registerEvent(front, type, listener) {
    const events = this._getEvents(front);
    if (events.has(type)) {
      events.get(type).add(listener);
    } else {
      events.set(type, new Set([listener]));
    }
  }

  unregisterEvent(front, type, listener) {
    const events = this._getEvents(front);
    if (!events.has(type)) {
      return;
    }

    if (!listener) {
      events.delete(type);
      return;
    }

    const listeners = events.get(type);
    if (listeners.has(listener)) {
      listeners.delete(listener);
    }

    if (!listeners.size) {
      events.delete(type);
    }
  }

  onAccessibilityFrontAvailable(accessibilityFront) {
    accessibilityFront.watchFronts(
      "accessiblewalker",
      this.onAccessibleWalkerFrontAvailable,
      this.onAccessibleWalkerFrontDestroyed
    );
  }

  onAccessibilityFrontDestroyed(accessibilityFront) {
    accessibilityFront.unwatchFronts(
      "accessiblewalker",
      this.onAccessibleWalkerFrontAvailable,
      this.onAccessibleWalkerFrontDestroyed
    );
  }

  onAccessibleWalkerFrontAvailable(accessibleWalkerFront) {
    this._accessibilityWalkerFronts.add(accessibleWalkerFront);
    // Apply all existing accessible walker front event listeners to the new
    // front.
    for (const [type, listeners] of this.accessibilityEvents.entries()) {
      for (const listener of listeners) {
        accessibleWalkerFront.on(type, listener);
      }
    }
  }

  onAccessibleWalkerFrontDestroyed(accessibleWalkerFront) {
    this._accessibilityWalkerFronts.delete(accessibleWalkerFront);
    // Remove all existing accessible walker front event listeners from the
    // destroyed front.
    for (const [type, listeners] of this.accessibilityEvents.entries()) {
      for (const listener of listeners) {
        accessibleWalkerFront.off(type, listener);
      }
    }
  }

  async onTargetAvailable({ targetFront, isTargetSwitching }) {
    targetFront.watchFronts(
      "accessibility",
      this.onAccessibilityFrontAvailable,
      this.onAccessibilityFrontDestroyed
    );

    if (!targetFront.isTopLevel) {
      return;
    }

    this._accessibilityWalkerFronts.clear();

    this.accessibilityFront = await this.currentTarget.getFront(
      "accessibility"
    );
    // To add a check for backward compatibility add something similar to the
    // example below:
    //
    // [this.supports.simulation] = await Promise.all([
    //   // Please specify the version of Firefox when the feature was added.
    //   this.currentTarget.actorHasMethod("accessibility", "getSimulator"),
    // ]);
    this.simulatorFront = this.accessibilityFront.simulatorFront;
    if (this.simulatorFront) {
      this.simulate = types => this.simulatorFront.simulate({ types });
    } else {
      this.simulate = null;
    }

    // Move accessibility front lifecycle event listeners to a new top level
    // front.
    for (const [type, listeners] of this.lifecycleEvents.entries()) {
      for (const listener of listeners.values()) {
        this.accessibilityFront.on(type, listener);
      }
    }

    this._updateTargetListeners.emit("target-updated", { isTargetSwitching });
  }

  async onTargetDestroyed({ targetFront }) {
    targetFront.unwatchFronts(
      "accessibility",
      this.onAccessibilityFrontAvailable,
      this.onAccessibilityFrontDestroyed
    );
  }
}

exports.AccessibilityProxy = AccessibilityProxy;
