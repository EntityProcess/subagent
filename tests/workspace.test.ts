import { describe, it, expect } from "vitest";
import path from "path";
import { transformWorkspacePaths } from "../src/utils/workspace.js";

describe("transformWorkspacePaths", () => {
  const templateDir = "/template/dir";

  describe("basic path resolution", () => {
    it("should resolve relative paths to absolute", () => {
      const input = JSON.stringify({
        folders: [
          { path: "./lib" },
          { path: "../shared" },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(3);
      expect(parsed.folders[0]).toEqual({ path: "." });
      expect(parsed.folders[1].path).toBe(path.resolve(templateDir, "./lib"));
      expect(parsed.folders[2].path).toBe(path.resolve(templateDir, "../shared"));
    });

    it("should preserve absolute paths unchanged", () => {
      const absolutePath = "/absolute/path/to/folder";
      const input = JSON.stringify({
        folders: [
          { path: absolutePath },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(2);
      expect(parsed.folders[0]).toEqual({ path: "." });
      expect(parsed.folders[1].path).toBe(absolutePath);
    });

    it("should resolve '.' to absolute template directory path", () => {
      const input = JSON.stringify({
        folders: [
          { path: "." },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(2);
      expect(parsed.folders[0]).toEqual({ path: "." });
      // Use path.resolve to handle platform differences
      expect(parsed.folders[1].path).toBe(path.resolve(templateDir));
    });
  });

  describe("subagent folder insertion", () => {
    it("should insert { path: '.' } as first folder entry", () => {
      const input = JSON.stringify({
        folders: [
          { path: "./src" },
          { path: "./lib" },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders[0]).toEqual({ path: "." });
      expect(parsed.folders).toHaveLength(3);
    });

    it("should insert subagent folder even with empty folders array", () => {
      const input = JSON.stringify({
        folders: [],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(1);
      expect(parsed.folders[0]).toEqual({ path: "." });
    });
  });

  describe("folder metadata preservation", () => {
    it("should preserve folder name and other properties", () => {
      const input = JSON.stringify({
        folders: [
          { path: "./src", name: "Source Code" },
          { path: "./lib", name: "Libraries" },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders[1]).toEqual({
        path: path.resolve(templateDir, "./src"),
        name: "Source Code",
      });
      expect(parsed.folders[2]).toEqual({
        path: path.resolve(templateDir, "./lib"),
        name: "Libraries",
      });
    });
  });

  describe("workspace settings preservation", () => {
    it("should preserve workspace settings and extensions", () => {
      const input = JSON.stringify({
        folders: [{ path: "./src" }],
        settings: {
          "editor.formatOnSave": true,
          "typescript.tsdk": "node_modules/typescript/lib",
        },
        extensions: {
          recommendations: ["dbaeumer.vscode-eslint"],
        },
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.settings).toEqual({
        "editor.formatOnSave": true,
        "typescript.tsdk": "node_modules/typescript/lib",
      });
      expect(parsed.extensions).toEqual({
        recommendations: ["dbaeumer.vscode-eslint"],
      });
    });
  });

  describe("mixed paths", () => {
    it("should handle mix of relative and absolute paths", () => {
      const absolutePath = "/absolute/path";
      const input = JSON.stringify({
        folders: [
          { path: "./relative" },
          { path: absolutePath },
          { path: "../other" },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(4);
      expect(parsed.folders[0]).toEqual({ path: "." });
      expect(parsed.folders[1].path).toBe(path.resolve(templateDir, "./relative"));
      expect(parsed.folders[2].path).toBe(absolutePath);
      expect(parsed.folders[3].path).toBe(path.resolve(templateDir, "../other"));
    });
  });

  describe("error handling", () => {
    it("should throw error for invalid JSON", () => {
      expect(() => {
        transformWorkspacePaths("invalid json", templateDir);
      }).toThrow("Invalid workspace JSON");
    });

    it("should throw error for missing folders array", () => {
      const input = JSON.stringify({
        settings: {},
      });

      expect(() => {
        transformWorkspacePaths(input, templateDir);
      }).toThrow("Workspace file must contain a 'folders' array");
    });

    it("should throw error if folders is not an array", () => {
      const input = JSON.stringify({
        folders: "not an array",
      });

      expect(() => {
        transformWorkspacePaths(input, templateDir);
      }).toThrow("Workspace 'folders' must be an array");
    });
  });

  describe("JSON formatting", () => {
    it("should return properly formatted JSON with 2-space indentation", () => {
      const input = JSON.stringify({
        folders: [{ path: "./src" }],
      });

      const result = transformWorkspacePaths(input, templateDir);

      // Check that result is properly formatted
      expect(result).toContain("  ");
      expect(result).toMatch(/{\n\s+"folders":/);
    });
  });

  describe("Windows paths", () => {
    it("should handle Windows absolute paths correctly", () => {
      const windowsPath = "C:\\Users\\test\\workspace";
      const input = JSON.stringify({
        folders: [
          { path: windowsPath },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders[1].path).toBe(windowsPath);
    });
  });

  describe("complex scenarios", () => {
    it("should handle template with only '.' path", () => {
      const input = JSON.stringify({
        folders: [{ path: "." }],
      });

      const templateLocation = "/template/location";
      const result = transformWorkspacePaths(input, templateLocation);
      const parsed = JSON.parse(result);

      expect(parsed.folders).toHaveLength(2);
      expect(parsed.folders[0]).toEqual({ path: "." });
      // Use path.resolve to handle platform differences
      expect(parsed.folders[1].path).toBe(path.resolve(templateLocation));
    });

    it("should handle deeply nested relative paths", () => {
      const input = JSON.stringify({
        folders: [
          { path: "./src/components/ui" },
          { path: "../../shared/lib" },
        ],
      });

      const result = transformWorkspacePaths(input, templateDir);
      const parsed = JSON.parse(result);

      expect(parsed.folders[1].path).toBe(path.resolve(templateDir, "./src/components/ui"));
      expect(parsed.folders[2].path).toBe(path.resolve(templateDir, "../../shared/lib"));
    });
  });
});
