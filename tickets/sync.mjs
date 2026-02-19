#!/usr/bin/env node
/**
 * Sync Linear issues with tickets folder.
 *
 * Pull (default): Fetch from Linear → tickets/tickets.md
 * Push: Create local tickets from tickets/local.md → Linear, then pull
 * Push-status: Update Linear issue status from tickets.md Status field
 *
 * Run from project root: node tickets/sync.mjs [--push] [--push-status]
 * Requires tickets/.env with LINEAR_API_KEY.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const LINEAR_API = "https://api.linear.app/graphql";
const TEAM_KEY = "LAN";
const PUSH = process.argv.includes("--push");
const PUSH_STATUS = process.argv.includes("--push-status");

function loadEnv() {
  try {
    const content = readFileSync(join(__dir, ".env"), "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
}

loadEnv();

async function graphql(apiKey, query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function getTeamId(apiKey) {
  const data = await graphql(apiKey, `
    query GetTeam($key: String!) {
      teams(filter: { key: { eq: $key } }) {
        nodes { id }
      }
    }
  `, { key: TEAM_KEY });
  const id = data.teams?.nodes?.[0]?.id;
  if (!id) throw new Error(`Team "${TEAM_KEY}" not found`);
  return id;
}

async function createIssue(apiKey, teamId, title, description = "") {
  const data = await graphql(apiKey, `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        issue { identifier, url, title }
      }
    }
  `, {
    input: {
      teamId,
      title: title.trim(),
      ...(description && { description: description.trim() }),
    },
  });
  return data.issueCreate?.issue;
}

async function fetchAllIssues(apiKey) {
  const allNodes = [];
  let cursor = null;
  const query = `
    query GetTeamIssues($teamKey: String!, $first: Int!, $after: String) {
      issues(
        filter: {
          team: { key: { eq: $teamKey } }
          state: { type: { in: ["unstarted", "started", "completed"] } }
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
  do {
    const data = await graphql(apiKey, query, {
      teamKey: TEAM_KEY,
      first: 100,
      ...(cursor && { after: cursor }),
    });
    const { nodes, pageInfo } = data.issues;
    allNodes.push(...nodes);
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);
  return allNodes;
}

function parseTicketsMd(content) {
  const tickets = [];
  const blocks = content.split(/(?=###\s+\[)/);
  for (const block of blocks) {
    const idMatch = block.match(/^###\s+\[([A-Z]+-\d+)\]/);
    const statusMatch = block.match(/\|\s*\*\*Status\*\*\s*\|\s*([^|]+)\s*\|/);
    if (idMatch && statusMatch) {
      tickets.push({
        identifier: idMatch[1],
        status: statusMatch[1].trim(),
      });
    }
  }
  return tickets;
}

async function getWorkflowStates(apiKey, teamId) {
  const data = await graphql(apiKey, `
    query GetWorkflowStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes { id name }
        }
      }
    }
  `, { teamId });
  return data.team?.states?.nodes ?? [];
}

async function getIssueByIdentifier(apiKey, identifier) {
  const data = await graphql(apiKey, `
    query GetIssue($identifier: String!) {
      issues(filter: { identifier: { eq: $identifier } }, first: 1) {
        nodes {
          id
          identifier
          state { id name }
        }
      }
    }
  `, { identifier });
  return data.issues?.nodes?.[0] ?? null;
}

async function updateIssueState(apiKey, issueId, stateId) {
  await graphql(apiKey, `
    mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }
  `, { id: issueId, input: { stateId } });
}

async function pushStatusToLinear(apiKey) {
  const mdPath = join(__dir, "tickets.md");
  if (!existsSync(mdPath)) {
    console.log("No tickets/tickets.md found.");
    return;
  }
  const content = readFileSync(mdPath, "utf8");
  const tickets = parseTicketsMd(content);
  if (tickets.length === 0) {
    console.log("No tickets found in tickets.md");
    return;
  }
  const teamId = await getTeamId(apiKey);
  const states = await getWorkflowStates(apiKey, teamId);
  const stateByName = Object.fromEntries(states.map((s) => [s.name, s.id]));
  let updated = 0;
  for (const t of tickets) {
    const issue = await getIssueByIdentifier(apiKey, t.identifier);
    if (!issue) {
      console.warn(`Issue ${t.identifier} not found, skipping`);
      continue;
    }
    const currentStateName = issue.state?.name ?? "";
    if (currentStateName === t.status) continue;
    const newStateId = stateByName[t.status];
    if (!newStateId) {
      console.warn(`Unknown status "${t.status}" for ${t.identifier}, skipping`);
      continue;
    }
    await updateIssueState(apiKey, issue.id, newStateId);
    console.log(`Updated ${t.identifier}: ${currentStateName} → ${t.status}`);
    updated++;
  }
  console.log(`Pushed ${updated} status update(s) to Linear`);
}

function parseLocalTickets(content) {
  const tickets = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^[-*]\s+(?:\[[\sx]\]\s+)?(.+)$/i);
    if (m) {
      let desc = "";
      let j = i + 1;
      while (j < lines.length && /^\s{2,}.+/.test(lines[j])) {
        desc += (desc ? "\n" : "") + lines[j].replace(/^\s{2,}/, "");
        j++;
      }
      tickets.push({
        title: m[1].trim(),
        description: desc.trim(),
        lineStart: i,
        lineEnd: j - 1,
      });
    }
  }
  return tickets;
}

async function pushLocalTickets(apiKey) {
  const localPath = join(__dir, "local.md");
  if (!existsSync(localPath)) {
    console.log("No tickets/local.md found.");
    return;
  }

  const content = readFileSync(localPath, "utf8");
  const tickets = parseLocalTickets(content);
  if (tickets.length === 0) {
    console.log("No new tickets in tickets/local.md");
    return;
  }

  const teamId = await getTeamId(apiKey);
  const created = [];
  for (const t of tickets) {
    const issue = await createIssue(apiKey, teamId, t.title, t.description);
    if (issue) {
      created.push({ ...t, identifier: issue.identifier });
      console.log(`Created ${issue.identifier}: ${issue.title}`);
    }
  }

  if (created.length > 0) {
    const lines = content.split("\n");
    const toRemove = new Set();
    for (const t of created) {
      for (let i = t.lineStart; i <= t.lineEnd; i++) toRemove.add(i);
    }
    const newLines = lines.filter((_, i) => !toRemove.has(i));
    let newContent = newLines.join("\n").replace(/\n{3,}/g, "\n\n");
    if (!newContent.trim().endsWith("\n")) newContent += "\n";
    writeFileSync(localPath, newContent, "utf8");
    console.log(`Removed ${created.length} ticket(s) from local.md`);
  }
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

async function pull(apiKey) {
  const issues = await fetchAllIssues(apiKey);
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
  writeFileSync(join(__dir, "tickets.md"), md, "utf8");
  return issues.length;
}

async function main() {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error("Add LINEAR_API_KEY to tickets/.env");
    console.error("Get your key: https://linear.app/settings/api");
    process.exit(1);
  }

  if (PUSH) {
    await pushLocalTickets(apiKey);
  }

  if (PUSH_STATUS) {
    await pushStatusToLinear(apiKey);
  }

  console.log(`Fetching issues for team ${TEAM_KEY}...`);
  const count = await pull(apiKey);
  console.log(`Written ${count} issues to tickets/tickets.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
