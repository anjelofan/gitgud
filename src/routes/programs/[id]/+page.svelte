<script lang="ts">
    import type { Assignment, Program, RosterEntry } from '$lib/server/db/schema';
    import { resolve } from '$app/paths';

    interface Issue {
        path: string;
        message: string;
    }

    interface AssignmentFormData {
        name: string;
        deadline: string;
        templateRepo: string;
    }

    interface RosterFormData {
        addName: string;
        rosterText: string;
        renameEntryId: string;
        renameName: string;
    }

    interface Props {
        data: {
            program: Pick<Program, 'name' | 'org'>;
            students: Pick<RosterEntry, 'id' | 'name'>[];
            assignments: Pick<Assignment, 'id' | 'name'>[];
        };
        form:
            | ({
                  scope: 'assignment';
                  message: string;
                  issues: Issue[];
                  data: AssignmentFormData;
              } & Record<string, unknown>)
            | ({
                  scope: 'roster';
                  message: string;
                  issues: Issue[];
                  data: RosterFormData;
              } & Record<string, unknown>)
            | null;
    }

    let { data, form }: Props = $props();
    let { program, students, assignments } = $derived(data);

    let assignmentForm = $derived(
        form !== null && form.scope === 'assignment' && 'issues' in form ? form : null,
    );
    let rosterForm = $derived(
        form !== null && form.scope === 'roster' && 'issues' in form ? form : null,
    );

    function renameValue(student: Pick<RosterEntry, 'id' | 'name'>) {
        if (rosterForm === null) return student.name;
        if (rosterForm.data.renameEntryId === student.id) return rosterForm.data.renameName;
        return student.name;
    }
</script>

<div>
    <a href={resolve('/')}>← Back to dashboard</a>
    <h1>{program.name}</h1>
    <p>GitHub organization: <code>{program.org}</code></p>

    <h2>Create Assignment</h2>

    {#if assignmentForm !== null}
        <div role="alert">
            <p>{assignmentForm.message}</p>
            {#if assignmentForm.issues.length > 0}
                <ul>
                    {#each assignmentForm.issues as issue (issue.path + issue.message)}
                        <li><code>{issue.path}</code>: {issue.message}</li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <form method="POST" action="?/create-assignment">
        <div>
            <label>
                <p>Assignment Name</p>

                <input
                    type="text"
                    name="name"
                    maxlength="120"
                    value={assignmentForm === null ? '' : assignmentForm.data.name}
                    required
                />
            </label>
        </div>

        <div>
            <label>
                <p>Deadline</p>
                <input
                    type="datetime-local"
                    name="deadline"
                    required
                    value={assignmentForm === null ? '' : assignmentForm.data.deadline}
                />
            </label>
        </div>

        <div>
            <label>
                <p>Repository Template</p>
                <input
                    type="text"
                    name="templateRepo"
                    maxlength="100"
                    required
                    value={assignmentForm === null ? '' : assignmentForm.data.templateRepo}
                />
            </label>
        </div>
        <button type="submit">Create Assignment</button>
    </form>

    <h2>Assignments</h2>
    {#each assignments as a (a.id)}
        <a href={resolve('/assignments/[id]', { id: a.id })}> {a.name}</a>
    {/each}

    <h2>Student roster</h2>

    {#if rosterForm !== null}
        <div role="alert">
            <p>{rosterForm.message}</p>
            {#if rosterForm.issues.length > 0}
                <ul>
                    {#each rosterForm.issues as issue (issue.path + issue.message)}
                        <li><code>{issue.path}</code>: {issue.message}</li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    <form method="POST" action="?/add-student">
        <div>
            <label for="add-student-name">Add student</label>
            <input
                id="add-student-name"
                name="name"
                type="text"
                maxlength="120"
                required
                value={rosterForm === null ? '' : rosterForm.data.addName}
            />
        </div>
        <button type="submit">Add student</button>
    </form>

    <form method="POST" action="?/add-roster" enctype="multipart/form-data">
        <fieldset>
            <legend>Add students in batch</legend>
            <div>
                <label for="roster-csv">Upload roster CSV</label>
                <input id="roster-csv" name="rosterCsv" type="file" accept=".csv,text/csv" />
                <p>Student names in the first column.</p>
            </div>
            <div>
                <label for="roster-text">Or paste student names</label>
                <textarea id="roster-text" name="rosterText" rows="6"
                    >{rosterForm === null ? '' : rosterForm.data.rosterText}</textarea
                >
                <p>One student name per line.</p>
            </div>
        </fieldset>
        <button type="submit">Add batch</button>
    </form>

    {#if students.length === 0}
        <p>No students in this program yet.</p>
    {:else}
        <ul>
            {#each students as student (student.id)}
                <li>
                    <input
                        type="checkbox"
                        name="entryIds"
                        value={student.id}
                        form="remove-selected"
                        aria-label="Select {student.name} for removal"
                    />
                    {#key student.id}
                        <form method="POST" action="?/rename-student">
                            <input type="hidden" name="entryId" value={student.id} />
                            <label>
                                <span class="sr-only">Name for {student.name}</span>
                                <input
                                    type="text"
                                    name="name"
                                    maxlength="120"
                                    required
                                    value={renameValue(student)}
                                />
                            </label>
                            <button type="submit">Rename</button>
                        </form>
                    {/key}
                    <form method="POST" action="?/remove-students">
                        <input type="hidden" name="entryIds" value={student.id} />
                        <button type="submit">Remove</button>
                    </form>
                </li>
            {/each}
        </ul>

        <form id="remove-selected" method="POST" action="?/remove-students">
            <button type="submit">Remove selected</button>
        </form>
    {/if}
</div>

<style>
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
</style>
