const PrefixTags = {
	"#": "h1",
	"##": "h2",
	"###": "h3",
	"[ ]": "ul",
	"[x]": "ul",
	"-": "ul",
	"*": "ul",
	">": "blockquote",
};

export function richTextToHTML(richText: string) {
	let lines: string[] = [];
	let listStack: { type: string; level: number }[] = [];
	let currentListType: string | null = null;
	let inCodeBlock = false;
	let codeBlockContent: string[] = [];

	for (const line of richText.split("\n")) {
		if (line.trim() === "```") {
			if (inCodeBlock) {
				lines.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);
				codeBlockContent = [];
			}
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			codeBlockContent.push(line);
			continue;
		}

		const [tag, text, isNumbered, indentLevel] = getTextAndTag(line, false);

		// Close lists if needed
		while (listStack.length > 0 && listStack[listStack.length - 1].level > indentLevel) {
			lines.push(`</${listStack.pop().type}>`);
		}

		if (tag === "ul" || isNumbered) {
			const newListType = isNumbered ? "ol" : "ul";

			if (listStack.length === 0 || listStack[listStack.length - 1].level < indentLevel) {
				lines.push(`<${newListType}>`);
				listStack.push({ type: newListType, level: indentLevel });
				currentListType = newListType;
			} else if (listStack[listStack.length - 1].type !== newListType) {
				if (currentListType !== newListType) {
					lines.push(`</${currentListType}>`);
					lines.push(`<${newListType}>`);
					currentListType = newListType;
				}
			}

			lines.push(`<li>${text}</li>`);
		} else {
			if (currentListType) {
				lines.push(`</${currentListType}>`);
				currentListType = null;
			}
			if (tag) {
				lines.push(`<${tag}>${text}</${tag}>`);
			} else {
				lines.push(text);
			}
		}
	}

	// Close any remaining open lists
	if (currentListType) {
		lines.push(`</${currentListType}>`);
	}
	while (listStack.length > 0) {
		lines.push(`</${listStack.pop().type}>`);
	}

	return lines.join("\n");
}

export function richTextToPlainText(richText: string) {
	let lines: string[] = [];
	let inCodeBlock = false;

	for (const line of richText.split("\n")) {
		if (line.trim() === "```") {
			inCodeBlock = !inCodeBlock;
			continue;
		}

		if (inCodeBlock) {
			lines.push(line);
		} else {
			const [tag, text] = getTextAndTag(line, true);
			lines.push(text);
		}
	}

	return lines.join("\n");
}

function getTextAndTag(text: string, removeMarkdown: boolean) {
	const indentMatch = text.match(/^(\s*)/);
	const indentLevel = indentMatch ? Math.floor(indentMatch[1].length / 4) : 0;
	text = text.trim();

	for (const prefix in PrefixTags) {
		if (text.startsWith(prefix + " ")) {
			const newText = text.slice(prefix.length + 1);
			return [PrefixTags[prefix], markdownToText(newText, removeMarkdown), false, indentLevel];
		}
	}

	// Check for numbered list
	const numberedListMatch = text.match(/^(\d+)\.\s(.+)/);
	if (numberedListMatch) {
		return [null, markdownToText(numberedListMatch[2], removeMarkdown), true, indentLevel];
	}

	return [null, markdownToText(text, removeMarkdown), false, indentLevel];
}

function markdownToText(line: string, removeMarkdown: boolean) {
	// Convert bold
	line = line.replace(
		/(\*\*|__)((?:\\[\s\S]|[^\\])+?)\1/g,
		removeMarkdown ? "$2" : "<strong>$2</strong>"
	);

	// Convert italics
	line = line.replace(/(\*|_)((?:\\[\s\S]|[^\\])+?)\1/g, removeMarkdown ? "$2" : "<em>$2</em>");

	// Convert strikethrough
	line = line.replace(/~~((?:\\[\s\S]|[^\\])+?)~~/g, removeMarkdown ? "$1" : "<del>$1</del>");

	// Convert links
	line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, removeMarkdown ? "$1" : '<a href="$2">$1</a>');

	// Convert inline code
	line = line.replace(/`((?:\\[\s\S]|[^\\])+?)`/g, removeMarkdown ? "$1" : "<code>$1</code>");

	return line;
}
