#!/usr/bin/env node
/**
 * Sync Linear issues to tickets/tickets.md.
 * Run from project root: node tickets/sync.mjs
 *
 * Requires tickets/.env with LINEAR_API_KEY.
 * Get your key: https://linear.app/settings/api
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const LINEAR_API = "https://api.linear.app/graphql";
const TEAM_KEY = "LAN";

function loadEnv() {
  try {
    const envPath = join(__dir, ".env");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env not found
  }
}

loadEnv();

const query = `
  query GetTeamIssues($teamKey: String!, $first: Int!, $after: String) {
    issues(
      filter: {
        team: { key: { eq: $teamKey } }
        state: { type: { in: ["unstarted", "started"] } }
      }
      first: $first
      after: $after
      orderBy: updatedAt
    ) {
      nodes {
        identifier
        title
        description
        url
        state { name }
        priority
        assignee { name }
        labels { nodes { name } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

async function fetchAllIssues(apiKey) {
  const allNodes = [];
  let cursor = null;

  do {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        query,
        variables: {
          teamKey: TEAM_KEY,
          first: 100,
          ...(cursor && { after: cursor }),
        },
      }),
    });

    if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);

    const { nodes, pageInfo } = json.data.issues;
    allNodes.push(...nodes);
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return allNodes;
}

function formatTicket(issue) {
  const labels = issue.labels?.nodes?.map((l) => l.name).join(", ") || "";
  const assignee = issue.assignee?.name || "Unassigned";
  const desc = (issue.description || "").trim();

  return [
    `### [${issue.identifier}] ${issue.title}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Status** | ${issue.state?.name ?? "—"} |`,
    `| **Priority** | ${issue.priority ?? "—"} |`,
    `| **Assignee** | ${assignee} |`,
    `| **Labels** | ${labels || "—"} |`,
    `| **URL** | ${issue.url} |`,
    "",
    desc ? `${desc}\n` : "",
  ].join("\n");
}

const OUTPUT_PATH = join(__dir, "tickets.md");

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error("Add LINEAR_API_KEY to tickets/.env");
    console.error("Get your key: https://linear.app/settings/api");
    process.exit(1);
  }

  console.log(`Fetching issues for team ${TEAM_KEY}...`);
  const issues = await fetchAllIssues(apiKey);
  console.log(`Found ${issues.length} active issues.`);

  const md = [
    `# Linear Tickets — Team ${TEAM_KEY}`,
    "",
    `_Last synced: ${new Date().toISOString()}_`,
    "",
    "Reference with **@tickets** in Cursor when coding.",
    "",
    "---",
    "",
    ...issues.map(formatTicket),
  ].join("\n");

  writeFileSync(OUTPUT_PATH, md, "utf8");
  console.log(`Written to tickets/tickets.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
