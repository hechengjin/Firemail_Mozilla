# Any copyright is dedicated to the public domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from __future__ import absolute_import, print_function, unicode_literals

import pytest
from mozunit import main
from tryselect.selectors.auto import TRY_AUTO_PARAMETERS

from taskgraph.transforms.tests import CHUNK_SUITES_BLACKLIST
from taskgraph.util.bugbug import push_schedules
from taskgraph.util.chunking import BugbugLoader


pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def tgg(create_tgg):
    params = TRY_AUTO_PARAMETERS.copy()
    params.update(
        {
            "head_repository": "https://hg.mozilla.org/try",
            "project": "try",
            "target_kind": "test",
            # These ensure this isn't considered a backstop. The pushdate must
            # be slightly higher than the one in data/pushes.json, and
            # pushlog_id must not be a multiple of 10.
            "pushdate": 1593029536,
            "pushlog_id": "2",
        }
    )
    tgg = create_tgg(overrides=params)
    return tgg


@pytest.fixture(scope="module")
def params(tgg):
    return tgg.parameters


@pytest.fixture(scope="module")
def full_task_graph(tgg):
    return tgg.full_task_graph


@pytest.fixture(scope="module")
def optimized_task_graph(full_task_graph, tgg):
    return tgg.optimized_task_graph


def test_generate_graph(optimized_task_graph):
    """Simply tests that generating the graph does not fail."""
    assert len(optimized_task_graph.tasks) > 0


def test_only_important_manifests(params, full_task_graph, filter_tasks):
    data = push_schedules(params["project"], params["head_rev"])
    important_manifests = {
        m
        for m, c in data.get("groups", {}).items()
        if c >= BugbugLoader.CONFIDENCE_THRESHOLD
    }

    # Ensure we don't schedule unimportant manifests.
    for task in filter_tasks(full_task_graph, lambda t: t.kind == "test"):
        attr = task.attributes.get

        if attr("unittest_suite") in CHUNK_SUITES_BLACKLIST:
            assert not attr("test_manifests")
        else:
            unimportant = [
                t for t in attr("test_manifests") if t not in important_manifests
            ]
            assert unimportant == []


def test_no_shippable_builds(tgg, filter_tasks):
    optimized_task_graph = tgg.optimized_task_graph
    # We can still sometimes get macosx64-shippable builds with |mach try
    # auto| due to TV tasks (since there is no 'opt' alternative for
    # macosx). Otherwise there shouldn't be any other shippable builds.
    tasks = [
        t.label
        for t in filter_tasks(
            optimized_task_graph,
            lambda t: t.kind == "build"
            and "shippable" in t.attributes["build_platform"],
        )
    ]

    assert tasks == []


if __name__ == "__main__":
    main()
