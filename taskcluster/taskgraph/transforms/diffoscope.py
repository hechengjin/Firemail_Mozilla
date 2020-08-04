# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
This transform construct tasks to perform diffs between builds, as
defined in kind.yml
"""

from __future__ import absolute_import, print_function, unicode_literals

from six import text_type
from taskgraph.transforms.base import TransformSequence
from taskgraph.transforms.task import task_description_schema
from taskgraph.util.schema import (
    Schema,
)
from taskgraph.util.taskcluster import get_artifact_path
from voluptuous import (
    Any,
    Optional,
    Required,
)

index_or_string = Any(
    text_type,
    {Required('index-search'): text_type},
)

diff_description_schema = Schema({
    # Name of the diff task.
    Required('name'): text_type,

    # Treeherder symbol.
    Required('symbol'): text_type,

    # relative path (from config.path) to the file the task was defined in.
    Optional('job-from'): text_type,

    # Original and new builds to compare.
    Required('original'): index_or_string,
    Required('new'): index_or_string,

    # Arguments to pass to diffoscope, used for job-defaults in
    # taskcluster/ci/diffoscope/kind.yml
    Optional('args'): text_type,

    # Extra arguments to pass to diffoscope, that can be set per job.
    Optional('extra-args'): text_type,

    # Fail the task when differences are detected.
    Optional('fail-on-diff'): bool,

    # What artifact to check the differences of. Defaults to target.tar.bz2
    # for Linux, target.dmg for Mac, target.zip for Windows, target.apk for
    # Android.
    Optional('artifact'): text_type,

    # Whether to unpack first. Diffoscope can normally work without unpacking,
    # but when one needs to --exclude some contents, that doesn't work out well
    # if said content is packed (e.g. in omni.ja).
    Optional('unpack'): bool,

    # Commands to run before performing the diff.
    Optional('pre-diff-commands'): [text_type],

    # Only run the task on a set of projects/branches.
    Optional('run-on-projects'): task_description_schema['run-on-projects'],

    Optional('optimization'): task_description_schema['optimization'],
})

transforms = TransformSequence()
transforms.add_validate(diff_description_schema)


@transforms.add
def fill_template(config, tasks):
    dummy_tasks = {}

    for task in tasks:
        name = task['name']

        deps = {}
        urls = {}
        previous_artifact = None
        artifact = task.get('artifact')
        for k in ('original', 'new'):
            value = task[k]
            if isinstance(value, text_type):
                deps[k] = value
                dep_name = k
                os_hint = value
            else:
                index = value['index-search']
                if index not in dummy_tasks:
                    dummy_tasks[index] = {
                        'label': 'index-search-' + index,
                        'description': index,
                        'worker-type': 'invalid/always-optimized',
                        'run': {
                            'using': 'always-optimized',
                        },
                        'optimization': {
                            'index-search': [index],
                        }
                    }
                    yield dummy_tasks[index]
                deps[index] = 'index-search-' + index
                dep_name = index
                os_hint = index.split('.')[-1]
            if artifact:
                pass
            elif 'linux' in os_hint:
                artifact = 'target.tar.bz2'
            elif 'macosx' in os_hint:
                artifact = 'target.dmg'
            elif 'android' in os_hint:
                artifact = 'target.apk'
            elif 'win' in os_hint:
                artifact = 'target.zip'
            else:
                raise Exception(
                    'Cannot figure out the OS for {!r}'.format(value))
            if previous_artifact is not None and previous_artifact != artifact:
                raise Exception(
                    'Cannot compare builds from different OSes')
            urls[k] = {
                'artifact-reference': '<{}/{}>'.format(
                    dep_name, get_artifact_path(task, artifact)),
            }
            previous_artifact = artifact

        taskdesc = {
            'label': 'diff-' + name,
            'description': name,
            'treeherder': {
                'symbol': task['symbol'],
                'platform': 'diff/opt',
                'kind': 'other',
                'tier': 2,
            },
            'worker-type': 'b-linux',
            'worker': {
                'docker-image': {'in-tree': 'diffoscope'},
                'artifacts': [{
                    'type': 'file',
                    'path': '/builds/worker/{}'.format(f),
                    'name': 'public/{}'.format(f),
                } for f in (
                    'diff.html',
                    'diff.txt',
                )],
                'env': {
                    'ORIG_URL': urls['original'],
                    'NEW_URL': urls['new'],
                    'DIFFOSCOPE_ARGS': ' '.join(
                        task[k] for k in ('args', 'extra-args') if k in task),
                    'PRE_DIFF': '; '.join(task.get('pre-diff-commands', [])),
                },
                'max-run-time': 1800,
            },
            'run': {
                'using': 'run-task',
                'checkout': task.get('unpack', False),
                'command': '/builds/worker/bin/get_and_diffoscope{}{}'.format(
                    ' --unpack' if task.get('unpack') else '',
                    ' --fail' if task.get('fail-on-diff') else '',
                ),
            },
            'dependencies': deps,
            'optimization': task.get('optimization'),
        }
        if 'run-on-projects' in task:
            taskdesc['run-on-projects'] = task['run-on-projects']

        if artifact.endswith('.dmg'):
            taskdesc.setdefault('fetches', {}).setdefault('toolchain', []).extend([
                'linux64-cctools-port',
                'linux64-libdmg',
            ])

        yield taskdesc
