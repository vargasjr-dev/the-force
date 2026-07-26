/**
 * post-model-call hook — auto-hyperlink PR references + inject PR link.
 *
 * Two responsibilities on finalized mainAgent replies:
 *
 * 1. Hyperlink PR references. Scans text blocks for patterns like "PR #35755"
 *    and replaces them with markdown links to the GitHub repo of the most
 *    recent `git push` in this conversation (recorded by the post-tool-use
 *    hook from the pushed worktree's origin remote). If no push has been seen,
 *    references are left as plain text rather than guessed — a wrong repo is
 *    worse than an unlinked reference.
 *
 * 2. Inject PR link. If the post-tool-use hook discovered a PR URL after a
 *    `git push` and the model didn't already mention it in its text, appends
 *    the URL as a final text block. Only on the final no-tool reply.
 *
 * Only acts on finalized, no-error replies from the main agent. Mutates text
 * blocks in place and may append a text block — the loop adopts the hook's
 * content as the persisted and streamed message.
 */

import type { PluginHookFn, PostModelCallContext } from "@vellumai/plugin-api";

import { getPrLink, getPushRepo } from "../src/pr-link-store.js";

/**
 * Regex matching "PR #NNNNN" with optional surrounding whitespace. Captures
 * the number. Matches "PR #35755", "pr #35755", "PR#35755" etc.
 *
 * The negative lookbehind `(?<!\[)` prevents re-wrapping PR references that
 * are already inside a markdown link (e.g. `[PR #36096](url)`), which keeps
 * the hook idempotent across turns — the model often echoes prior hyperlinked
 * output, and without this guard each pass would add another nesting layer.
 */
const PR_REF_REGEX = /(?<!\[)\bPR\s*#(\d{2,8})\b/gi;

/**
 * Replace all "PR #NNNNN" references in a text string with markdown links to
 * the given `owner/repo`. Returns the original string if no matches found.
 */
function hyperlinkPrRefs(text: string, repo: string): string {
  return text.replace(PR_REF_REGEX, (match, numStr: string) => {
    const num = parseInt(numStr, 10);
    return `[${match}](https://github.com/${repo}/pull/${num})`;
  });
}

const postModelCall: PluginHookFn<PostModelCallContext> = async (ctx) => {
  if (ctx.error) return;
  if (ctx.callSite !== "mainAgent") return;

  // Only hyperlink when we know which repo the most recent push targeted.
  // Without that context we leave `PR #NNN` as plain text rather than guess.
  const pushRepo = getPushRepo(ctx.conversationId);
  if (pushRepo) {
    let modified = false;
    for (const block of ctx.content) {
      if (
        block.type === "text" &&
        /(?<!\[)\bPR\s*#\d{2,8}\b/i.test(block.text)
      ) {
        block.text = hyperlinkPrRefs(block.text, pushRepo);
        modified = true;
      }
    }

    if (modified) {
      ctx.logger.debug(
        {
          plugin: "the-force",
          conversationId: ctx.conversationId,
          pushRepo,
        },
        "Hyperlinked PR references in model output",
      );
    }
  }

  // Inject PR link discovered by the post-tool-use hook, if the model
  // didn't already include it in its text. Only on the final no-tool
  // reply — a tool-bearing turn continues naturally and the model may
  // still mention the link on its own.
  const prUrl = getPrLink(ctx.conversationId);
  if (prUrl) {
    const hasToolUse = ctx.content.some((block) => block.type === "tool_use");
    if (!hasToolUse) {
      const text = ctx.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("\n");

      if (!text.includes(prUrl)) {
        ctx.content.push({
          type: "text",
          text: `\n\nPR: ${prUrl}`,
        });
        ctx.logger.info(
          {
            plugin: "the-force",
            conversationId: ctx.conversationId,
            prUrl,
          },
          "Injected PR link into final reply",
        );
      }
    }
  }
};

export default postModelCall;
