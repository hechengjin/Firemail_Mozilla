/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

// @flow

export function basename(path: string): string {
  return path.split("/").pop();
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return path.slice(0, idx);
}

export function isURL(str: string): boolean {
  return str.includes("://");
}

export function isAbsolute(str: string): boolean {
  return str[0] === "/";
}

export function join(base: string, dir: string): string {
  return `${base}/${dir}`;
}
