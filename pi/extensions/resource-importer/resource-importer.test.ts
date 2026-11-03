import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
	dedupeCandidates,
	discoverCandidates,
	findProjectRoot,
	getManifestPath,
	mergeSelectedCandidates,
	readImportedInstructions,
	readManifest,
	writeManifest,
} from "./src/core.ts";

function fixture(): string {
	return mkdtempSync(join(tmpdir(), "pi-resource-importer-"));
}

test("findProjectRoot uses the nearest Git root and otherwise the cwd", () => {
	const root = fixture();
	try {
		const repo = join(root, "repo");
		const nested = join(repo, "packages", "web");
		mkdirSync(join(repo, ".git"), { recursive: true });
		mkdirSync(nested, { recursive: true });
		assert.equal(findProjectRoot(nested), repo);
		const plain = join(root, "plain");
		mkdirSync(plain);
		assert.equal(findProjectRoot(plain), plain);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("discovers skills and instruction files while excluding the active project", () => {
	const root = fixture();
	try {
		const catalog = join(root, "catalog");
		const skill = join(catalog, "skills", "review");
		const otherProject = join(catalog, "other-project");
		const activeProject = join(catalog, "active-project");
		mkdirSync(skill, { recursive: true });
		mkdirSync(otherProject, { recursive: true });
		mkdirSync(activeProject, { recursive: true });
		writeFileSync(
			join(skill, "SKILL.md"),
			"---\nname: review\ndescription: Review risky changes before handoff.\n---\n\n# Review\n",
		);
		writeFileSync(join(otherProject, "AGENTS.md"), "# Other project guidance\n\nUse the shared workflow.\n");
		writeFileSync(join(activeProject, "AGENTS.md"), "# Current project\n");
		mkdirSync(join(catalog, "node_modules", "bad"), { recursive: true });
		writeFileSync(join(catalog, "node_modules", "bad", "SKILL.md"), "---\nname: bad\ndescription: ignore\n---\n");

		const candidates = discoverCandidates({
			skillRoots: [{ path: catalog, label: "catalog", maxDepth: 5 }],
			instructionRoots: [{ path: catalog, label: "catalog", maxDepth: 5 }],
			excludeRoot: activeProject,
		});
		assert.deepEqual(
			candidates.map((candidate) => [candidate.kind, candidate.name]),
			[
				["skill", "review"],
				["instructions", "Other project guidance"],
			],
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("deduplicates same-named skill copies while preserving a selected path", () => {
	const root = fixture();
	try {
		const first = join(root, "one", "ai-sdk");
		const selected = join(root, "two", "ai-sdk");
		mkdirSync(first, { recursive: true });
		mkdirSync(selected, { recursive: true });
		const content = "---\nname: ai-sdk\ndescription: Build AI applications.\n---\n\n# AI SDK\n";
		writeFileSync(join(first, "SKILL.md"), content);
		writeFileSync(join(selected, "SKILL.md"), `${content}\nSelected project variant.\n`);
		const candidates = discoverCandidates({
			skillRoots: [
				{ path: join(root, "one"), label: "first", maxDepth: 3 },
				{ path: join(root, "two"), label: "selected", maxDepth: 3 },
			],
			instructionRoots: [],
		});
		const deduped = dedupeCandidates(candidates, new Set([selected]));
		assert.equal(deduped.length, 1);
		assert.equal(deduped[0]?.path, selected);
		assert.equal(deduped[0]?.source, "selected · 2 copies");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("combines selected available and missing paths before deterministic same-name grouping", () => {
	const availableA = "/catalog/a/review";
	const availableB = "/catalog/b/review";
	const missing = "/gone/review";
	const candidates = [availableB, availableA].map((path, index) => ({
		id: `skill:${path}`,
		kind: "skill" as const,
		name: "review",
		description: "Review changes",
		path,
		source: index ? "a" : "b",
	}));
	const selected = new Set([availableA, availableB, missing]);
	const merged = mergeSelectedCandidates(candidates, selected);
	assert.equal(merged.length, 1);
	assert.equal(merged[0]?.path, availableA);
	assert.equal(merged[0]?.source, "a · 3 copies");
	assert.doesNotMatch(merged[0]?.description ?? "", /unavailable/);
	assert.deepEqual(mergeSelectedCandidates([...candidates].reverse(), selected), merged);
});

test("an available selected copy wins over a lexically earlier missing selection", () => {
	const available = {
		id: "skill:/z/review",
		kind: "skill" as const,
		name: "review",
		description: "Available review skill",
		path: "/z/review",
		source: "catalog",
	};
	const merged = mergeSelectedCandidates([available], new Set(["/a/review", available.path]));
	assert.equal(merged.length, 1);
	assert.equal(merged[0]?.path, available.path);
	assert.equal(merged[0]?.description, "Available review skill");
	assert.equal(merged[0]?.source, "catalog · 2 copies");
});

test("orders missing selected resources with available resources deterministically", () => {
	const candidates = [{ id: "instructions:/z", kind: "instructions" as const, name: "Zulu", description: "", path: "/z", source: "test" }];
	const selected = new Set(["/missing/Alpha.md"]);
	assert.deepEqual(mergeSelectedCandidates(candidates, selected).map((item) => item.name), ["Alpha.md", "Zulu"]);
});

test("manifest round-trips selected resources and loads available instructions", () => {
	const root = fixture();
	try {
		const skillPath = join(root, "skill");
		const instructionsPath = join(root, "AGENTS.md");
		mkdirSync(skillPath);
		writeFileSync(instructionsPath, "# Shared instructions\n\nBe precise.\n");
		const manifestPath = getManifestPath(root);
		writeManifest(manifestPath, [
			{ id: `skill:${skillPath}`, kind: "skill", name: "skill", description: "", path: skillPath, source: "test" },
			{
				id: `instructions:${instructionsPath}`,
				kind: "instructions",
				name: "AGENTS.md",
				description: "",
				path: instructionsPath,
				source: "test",
			},
		]);
		const manifest = readManifest(manifestPath);
		assert.ok(manifest);
		assert.deepEqual(manifest.skills, [skillPath]);
		assert.deepEqual(manifest.instructions, [instructionsPath]);
		assert.match(readFileSync(manifestPath, "utf8"), /"version": 1/);
		assert.deepEqual(readImportedInstructions(manifest), [
			{ path: instructionsPath, content: "# Shared instructions\n\nBe precise.\n" },
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("invalid manifests are ignored", () => {
	const root = fixture();
	try {
		const path = getManifestPath(root);
		mkdirSync(join(root, ".pi"));
		writeFileSync(path, "{not-json");
		assert.equal(readManifest(path), undefined);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
