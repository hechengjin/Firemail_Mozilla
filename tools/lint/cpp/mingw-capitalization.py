# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re

from mozlint.types import LineType

here = os.path.abspath(os.path.dirname(__file__))
HEADERS_FILE = os.path.join(here, "mingw-headers.txt")
# generated by cd mingw-w64/mingw-w64-headers &&
#  find . -name "*.h" | xargs -I bob -- basename bob | sort | uniq)


class MinGWCapitalization(LineType):
    def __init__(self, *args, **kwargs):
        super(MinGWCapitalization, self).__init__(*args, **kwargs)
        with open(HEADERS_FILE, "r") as fh:
            self.headers = fh.read().strip().splitlines()
        self.regex = re.compile("^#include\s*<(" + "|".join(self.headers) + ")>")

    def condition(self, payload, line, config):
        if not line.startswith("#include"):
            return False

        if self.regex.search(line, re.I):
            return not self.regex.search(line)


def lint(paths, config, **lintargs):
    results = []

    m = MinGWCapitalization()
    for path in paths:
        results.extend(m._lint(path, config, **lintargs))
    return results
