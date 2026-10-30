// Presentation only: keep recorded protocols, identifiers, links and code exact.
// Agents sometimes join common prose words to the next number ("at least5%").
export function formatResearchText(text: string): string {
  if (/^\s*[\[{]/.test(text)) return text;
  return text
    .split(/(```[\s\S]*?```|`[^`]*`|https?:\/\/\S+)/g)
    .map((part, index) =>
      index % 2
        ? part
        : part
            .replace(
              /\b(at least|At least|at most|At most|more than|less than|greater than|up to|after|before|through|from|between|within|than|and|or|versus|over|under|by|for|first|last|chronological|Chronological|at)(?=\d)/g,
              "$1 ",
            )
            .replace(
              /(\d)(?=(?:km\/s|m\/s|percent|hours|days|seconds)\b)/g,
              "$1 ",
            ),
    )
    .join("");
}
