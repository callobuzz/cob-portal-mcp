/** The text of the plan_growth_work prompt: how to send a main task with its sub-tasks as one draft batch. */
export function growthPlanPrompt(goal: string, category: string): string {
	return `Plan a piece of business work for the Call O Buzz portal, then send it as one batch of draft tasks.

Goal: ${goal || "(the goal the user names, for example: win long-term US clients as an agency)"}
Category: ${category || "Marketing and business growth"} (call list_categories and use one of those names exactly)

## How the portal holds a plan

- A main task is one result, for example "Proof assets". Its sub-tasks are the pieces a person can do alone, for example
  "Write three case studies".
- The admin approves the batch in the portal. The main tasks usually go to the admin, and the admin gives each sub-task to
  an employee later. Your key never assigns, approves, pays or sends mail.
- Before you plan, call list_tasks with category set to read what already exists, so you add to it and do not repeat it.

## The batch

Call draft_tasks with:

\`\`\`json
{
  "title": "Win long-term US clients: next steps",
  "tasks": [
    {
      "ref": "proof",
      "title": "2. Proof assets",
      "category": "Marketing and business growth",
      "notes": "What this main task is for, in two or three plain sentences.",
      "doneWhen": ["Three case studies, three short videos and the page for US companies are live."]
    },
    {
      "ref": "case-studies",
      "parentRef": "proof",
      "title": "Write three case studies",
      "brief": {
        "why": "A US buyer trusts real work before a first call.",
        "handIn": "Links to the three case studies with screenshots."
      },
      "doneWhen": ["Each case study has the problem, what we built, the result and three screenshots."],
      "steps": [
        { "key": "read", "title": "Read the brief and the notes it links", "minutes": 5, "needs": [] },
        { "key": "facts", "title": "Collect the facts and screenshots", "why": "Numbers make a case study real.",
          "how": "1. Write the problem in the client's words.\\n2. Note the numbers: time saved, users, launch date.\\nTip: hide every real person's data.",
          "minutes": 60, "needs": ["read"],
          "fields": [{ "key": "shots", "label": "Link to the folder with the screenshots", "type": "text", "required": true }],
          "checks": [{ "field": "shots", "startsWith": "https://", "message": "Paste the folder link." }] },
        { "key": "write", "title": "Write the three case studies", "minutes": 120, "needs": ["facts"],
          "fields": [{ "key": "links", "label": "Links to the three case studies", "type": "long_text", "required": true }],
          "checks": [{ "field": "links", "links": 3, "message": "Add the three links." }] },
        { "key": "self", "title": "Check your work against Done when", "minutes": 5, "needs": ["write"], "selfCheck": true }
      ]
    },
    {
      "parentRef": "proof",
      "title": "Make the page for US companies",
      "needsRefs": ["case-studies"],
      "notes": "Build the page once the case studies are ready.",
      "steps": [{ "title": "Write the words", "minutes": 60 }, { "title": "Build the page", "minutes": 90 }]
    }
  ]
}
\`\`\`

Rules for the batch:
1. Each main task has a ref. Each sub-task names it in parentRef and comes after it in the list.
2. A sub-task takes its main task's category, so set category on the main task only.
3. Use parentId instead of parentRef only to add a sub-task under a task that already exists (an id from list_tasks).
4. Keep it inside the portal limit of drafts in one batch. Split a big plan into more batches.
5. Give every sub-task a brief (why it matters, what to hand in) and steps. Each step has a title, a how with numbered
   lines, the planned minutes, and the fields the person fills. Steps run in order; needs: [] lets a step run any time.
6. A task that must wait for another names it: needsRefs with the other draft's ref, or needsIds with an existing task id.
   Never make two tasks wait for each other.

## Writing rules

1. Write in plain Indian English a new employee can follow. Short sentences. No em dashes, no jargon.
2. Put one result in each task. A title starts with a verb for a sub-task ("Research", "Write", "Set up").
3. In the brief, say why the task matters and what to hand in, such as a sheet of 30 named companies with a reason for
   each. In each step's how, say exactly what to do, where, and one tip.
4. Make each doneWhen line something a reviewer can check: a count, a link, a file, a date. Never "done well".
5. Keep numbers (counts, prices, per-week targets) as starting values the admin can change.

## After you send

The portal answers with batch_id. The drafts wait on the admin's drafts page. If the portal lists problems, each has a
path such as drafts[3].parentRef or drafts[2].body.steps[3].needs: fix those and send the whole batch again. Use get_draft to see what was approved.`;
}

/** The text of the write_test_plan prompt: the plan JSON format and the rules for writing it. */
export function testPlanPrompt(subject: string): string {
	return `Write a test plan for a person to run by hand, then send it to the portal as a draft check list.

Subject: ${subject || "(the product or feature the user names)"}

## The plan JSON format

\`\`\`json
{
  "project": "Name of the product",
  "areas": [
    {
      "id": "A01",
      "name": "Area name",
      "summary": "One line about the area.",
      "cases": [
        {
          "id": "A01-01",
          "title": "Short name of the test",
          "priority": "high",
          "device": "laptop",
          "url": "/login",
          "preconditions": "You are signed out.",
          "steps": ["Open the sign-in page.", "Click the Sign in button."],
          "expected": "The page shows the message \\"Enter your email\\" under the email box.",
          "screenshot": true
        }
      ]
    }
  ]
}
\`\`\`

Fields of a case:
- id: unique, letters, digits, dash. Use the area id, a dash and a number.
- title: a short name.
- priority: high, medium or low.
- device: phone, laptop or both. Default both.
- url: the real page path where the test starts. Optional.
- preconditions: what must be true before step 1. Optional.
- steps: a list of strings. Each string is one action.
- expected: what the tester must see when the steps are done.
- screenshot: true when the tester must attach a screenshot as proof even on a pass.

## Writing rules

1. Write in plain, simple English that a junior tester can follow. Short sentences. No jargon.
2. Use the real page paths and the real button and link labels from the product. Do not guess a label. If you do not know it, read the product first.
3. Put one idea in each step. One action per step.
4. Make the expected result exact: the text, the page, the colour or the count the tester must see. Do not write "works" or "looks fine".
5. Give each case its own id and keep the ids unique.
6. Group cases into areas by part of the product.

## Send it

Call the draft_checklist tool with the plan. If the portal lists problems, each has a path. Fix those and send the whole plan again.
The plan does not become a task at once. It waits as a draft until a person approves it in the portal.`;
}
