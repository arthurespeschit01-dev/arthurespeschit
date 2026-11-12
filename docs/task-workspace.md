# Task workspace inspired by Monday

## Analysis and selected scope

Official references reviewed on 12 November 2026:

- [How to build a task board](https://support.monday.com/hc/en-us/articles/115005317209-How-to-build-a-task-board): structured task lists with columns for ownership, status, priority and dates.
- [Group your board by anything](https://support.monday.com/hc/en-us/articles/4452237638546-Group-your-board-by-anything): regroup the same records for different operational questions.
- [All about subitems](https://support.monday.com/hc/en-us/articles/360011905480-All-about-subitems): break a delivery into smaller steps without duplicating the parent task.
- [Batch Actions](https://support.monday.com/hc/en-us/articles/115005335049-Batch-Actions): select several items and apply one change.
- [My Work](https://support.monday.com/hc/en-us/articles/360019300579-My-Work): quick access to assigned work and deadlines, plus table/calendar views and direct editing.

The Central implements the relevant daily workflow without adding Monday accounts or an integration. Default table supports inline assignee, status, priority and deadline updates. Groups by status, client, responsible person or priority can collapse; grouping never moves/deletes underlying records. Bulk edits operate on the visible selection, up to 200 tasks, and validate ownership atomically. Native controls and a dedicated mobile card layout provide the same actions without relying on drag-and-drop.

Kanban and the existing closure-date history remain. The calendar uses each task's deadline, provides monthly navigation, and changes into a chronological agenda on phones. Tasks without dates remain accessible. Overdue/today/next-seven-day shortcuts are based on America/Sao_Paulo. Completed and canceled work is absent from the active table/calendar; recent closures remain collapsed in Kanban, with all prior records in History.

Responsible person is a name, not a new permission or user invitation. Subtasks have independent completion and a progress indicator. Completing all subtasks does not silently close the main task. Ellipsis menus contain detail/edit/duplicate/delete actions; deletion requires confirmation. Duplicating copies task settings and subtask titles with all progress reset, leaving original comments and attachments with the original task.

## Data and recurrence

The additive migration adds assignee and recurrence-parent metadata and a separate owner-protected subtask table. It does not update any existing rows, assign historical dates or delete data. Subtask RLS requires ownership of both the subtask and its parent. Batch and duplication functions are authenticated security-invoker RPCs, with explicit owner validation.

The new editor uses an authenticated task RPC with atomic recurrence generation, so direct editing and batch completion behave consistently. Its transaction opts into the trigger; older open browser tabs retain their existing client-side recurrence behavior without double generation. A unique recurrence-parent reference prevents repeated completion/reopening from generating multiple successors. The next task carries the assignee and subtask titles; checklist completion resets. Month-end and leap-year dates clamp to real days; weekly/monthly/yearly selections respect the recurrence interval. A task without either start date or deadline does not generate a dated successor. Existing historical occurrences are left untouched. Deleting one task leaves any independent successor intact.

Realtime subscriptions plus visible-page polling/focus refresh keep the views aligned. Task, comment and attachment CRUD keeps explicit owner filters. Production verification uses a read-only hash snapshot of all existing tasks/clients/financial/CRM/form/message records and confirms their preservation after the migration; test writes use only isolated fixture databases.

## Verification

- `task-workspace-db.mjs`: preservation, subtask ownership, cross-owner atomic batch rejection, duplication, deletion boundaries, closure dates and recurrence idempotency/calendar edge cases.
- `task-workspace-browser.mjs`: browser → RPC → PostgreSQL flow for inline edits, groups, subtasks, progress, bulk edits, duplication/deletion confirmation, creation, automatic refresh, calendar and phone history/reopening.
- Existing `agency-browser.mjs` task/history regression and `tasks.test.ts`/`taskViews.test.ts` date/group/progress tests.
