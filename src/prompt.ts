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
