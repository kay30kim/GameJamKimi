/** Use baseline dots consistently in captions and their spoken source text. */
export function storyText(text: string): string {
  return text.replace(/[\u2026\u22ef]/g, "...");
}
