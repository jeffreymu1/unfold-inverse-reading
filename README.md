# Unfold — an augmentation for inverse reading

Unfold is an interactive walkthrough of two reading tools: revealing an LLM answer at a pace the reader chooses, and asking questions directly from highlighted passages. It explores how these tools could help readers work through an answer while keeping clarifications connected to the text they explain.

## Try the reading interface

- Choose a reading speed and select **Start reveal**. The answer appears letter by letter, with a pause between paragraphs.
- Pause whenever you need more time. You can also select **Show full answer** to read everything immediately.
- Highlight the words you want to ask about and select **Ask about these words**. You can also right-click a selection to open the same action.
- Enter your question in the module. Your selected words stay above the reply so you can see what the discussion refers to.
- Close the module when you are ready to return to the answer. A note at the passage lets you reopen the discussion.
- In the happy-path example, select **Show the source** to compare the clarification with Chapter 9.

## References

- [Rayner et al., Chapter 9: Comprehension of Discourse](rayner_ch9.pdf). The examples draw on pronoun reference (pp. 253–254), bridging inferences (pp. 263–264), and situation models (p. 269).
- [Hasler et al. (2007)](https://onlinelibrary.wiley.com/doi/10.1002/acp.1345). Research on learner control in instructional animation informs the choice to let readers control the reveal pace.
- [ScholarPhi (2021)](https://scholarphi.org/). Contextual definitions in scientific papers inform the placement of explanations beside the text they explain.
- [Fluid Annotations (2002)](https://archives.iw3c2.org/www2002/presentations/bouvin.pdf). Earlier work on annotations embedded in the reading surface.
- [Sensecape (2023)](https://sanghosuh.github.io/papers/sensecape_uist.pdf). Managing LLM information at multiple levels of abstraction informs the treatment of expanding explanations.
- [SnapExplain](https://mahdikhadem.com/projects/project-7/). Related work on asking for explanations of selected text through a local popup.
- [Assignment 2: Inverse Reading — assignment specification](https://endurable-diamond-2fc.notion.site/Assignment-2-Inverse-Reading-3e0ef3d12c9580328c9be33d336b2317). Provides the office story, questions, and inverse-reading activity used in the examples.

The reader makes the final judgment about whether the candidate answer is justified.
