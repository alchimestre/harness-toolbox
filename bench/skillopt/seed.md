# Jev effort-gate questions

Jev answers each question below as a probability from 0 to 1 about a subagent's assignment. Only the text under the three `##` headings is sent to Jev; keep those headings. The task agent starts at high. The gate keeps high when exhaustive >= 0.7 and exact < 0.7, lowers it one step to medium when exact >= 0.7 or urgent >= 0.7, and otherwise keeps high.

## exhaustive
Would a worker who stops at the first plausible match give a wrong or incomplete result, because the assignment asks for all instances, for other places that do the same thing, or for confirmation that nothing else exists?

## exact
Is the target already fully identified (file, function, or exact text given), so the work is a direct edit, a lookup, or a fixed reply?

## urgent
Does the assignment say speed matters more than thoroughness or cost?
