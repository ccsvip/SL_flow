import React from "react";

/**
 * Lightweight markdown renderer.
 *
 * Why custom instead of react-markdown: we want zero new dependencies
 * (the project already lives on Vite + AntD + a small set of well-known
 * libs). PRDs use a constrained subset of markdown - headings, lists,
 * tables, code fences, inline emphasis, links, blockquotes, mermaid
 * code blocks (rendered as text for now). This handles all of those.
 *
 * Security: every textual fragment goes through `escape()` before being
 * injected via `dangerouslySetInnerHTML`. We only emit dangerouslySet for
 * the inline HTML we ourselves generate. No user-supplied HTML survives.
 */

interface Props {
  markdown: string;
  className?: string;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string): string {
  let out = escape(s);
  // Inline code first - protect from later substitution.
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, body) => {
    codes.push(`<code>${body}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, href) =>
      `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer noopener">${text}</a>`,
  );
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, idx) => codes[Number(idx)]);
  return out;
}

/**
 * Strip our internal section markers (HTML comments) so the rendered
 * preview doesn't leak `<!-- prd:section:... -->` to readers. We keep
 * them in the underlying markdown string so per-section regeneration
 * still works.
 */
function stripMarkers(md: string): string {
  return md.replace(/<!--\s*prd:section:(start|end):[^>]*-->\n?/g, "");
}

function render(md: string): string {
  const lines = stripMarkers(md).split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";
  let listOpen: "" | "ul" | "ol" = "";
  let blockquoteOpen = false;
  let table: string[][] | null = null;

  const closeList = () => {
    if (listOpen) {
      out.push(`</${listOpen}>`);
      listOpen = "";
    }
  };
  const closeQuote = () => {
    if (blockquoteOpen) {
      out.push("</blockquote>");
      blockquoteOpen = false;
    }
  };
  const flushTable = () => {
    if (!table || table.length < 2) {
      table = null;
      return;
    }
    const [header, _align, ...body] = table;
    out.push('<div class="slf-md-table-wrap"><table>');
    out.push("<thead><tr>");
    for (const c of header) out.push(`<th>${inline(c)}</th>`);
    out.push("</tr></thead><tbody>");
    for (const row of body) {
      out.push("<tr>");
      for (const c of row) out.push(`<td>${inline(c)}</td>`);
      out.push("</tr>");
    }
    out.push("</tbody></table></div>");
    table = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    // Code fences --------------------------------------------------
    if (/^```/.test(line)) {
      closeList();
      closeQuote();
      flushTable();
      if (!inCode) {
        codeLang = line.replace(/^```/, "").trim();
        if (codeLang === "mermaid") {
          // Render mermaid blocks as a labeled note rather than raw -
          // we don't ship mermaid renderer to keep deps minimal.
          out.push(
            '<pre class="slf-md-code slf-md-mermaid"><code data-lang="mermaid">',
          );
        } else {
          out.push(
            `<pre class="slf-md-code"><code data-lang="${escape(codeLang)}">`,
          );
        }
        inCode = true;
      } else {
        out.push("</code></pre>");
        inCode = false;
        codeLang = "";
      }
      continue;
    }
    if (inCode) {
      out.push(escape(line));
      continue;
    }

    // Tables -------------------------------------------------------
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      closeQuote();
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (table === null) table = [];
      table.push(cells);
      continue;
    } else if (table !== null) {
      flushTable();
    }

    // Headings -----------------------------------------------------
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line)) {
      closeList();
      closeQuote();
      out.push("<hr />");
      continue;
    }

    // Blockquote ---------------------------------------------------
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      if (!blockquoteOpen) {
        out.push("<blockquote>");
        blockquoteOpen = true;
      }
      out.push(`<p>${inline(quote[1])}</p>`);
      continue;
    } else {
      closeQuote();
    }

    // Lists --------------------------------------------------------
    const ul = /^(\s*)[-*]\s+(.*)$/.exec(line);
    const ol = /^(\s*)\d+\.\s+(.*)$/.exec(line);
    if (ul) {
      if (listOpen !== "ul") {
        closeList();
        out.push("<ul>");
        listOpen = "ul";
      }
      out.push(`<li>${inline(ul[2])}</li>`);
      continue;
    }
    if (ol) {
      if (listOpen !== "ol") {
        closeList();
        out.push("<ol>");
        listOpen = "ol";
      }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    closeList();

    // Blank line ---------------------------------------------------
    if (line.trim() === "") {
      out.push("");
      continue;
    }

    // Paragraph ----------------------------------------------------
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  closeQuote();
  flushTable();
  if (inCode) out.push("</code></pre>");

  return out.join("\n");
}

export default function MarkdownView({ markdown, className }: Props) {
  const html = React.useMemo(() => render(markdown || ""), [markdown]);
  return (
    <div
      className={`slf-md ${className || ""}`}
      // The renderer escapes every input fragment before composition.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
