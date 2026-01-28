import { marked } from "marked";

export function markdownToHTML(richText: string) {
	return marked.parse(richText, {
		// This is needed for proper typing.
		async: false,
		// This adds support for tables and code blocks with language tags (```javascript ... ```).
		gfm: true,
		// This ensures single-line line breaks are preserved.
		breaks: true,
	});
}
