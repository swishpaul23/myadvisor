// Minimal robots.txt check: find the group for our user agent (or "*"), then apply the
// longest matching Allow/Disallow rule. Supports "*" wildcards and a trailing "$".

type Rule = { allow: boolean; pattern: string };

function parseGroups(robotsTxt: string): Map<string, Rule[]> {
  const groups = new Map<string, Rule[]>();
  let agents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!lastWasAgent) agents = [];
      agents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (value === "") continue;
      for (const agent of agents) {
        groups.get(agent)?.push({ allow: field === "allow", pattern: value });
      }
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

export function isPathAllowed(
  robotsTxt: string,
  userAgent: string,
  path: string,
): boolean {
  const groups = parseGroups(robotsTxt);
  const token = userAgent.toLowerCase().split(/[\s/(]/)[0] ?? "";
  const rules = groups.get(token) ?? groups.get("*") ?? [];
  let best: Rule | undefined;
  for (const rule of rules) {
    if (!matches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best?.allow ?? true;
}
