import path from "path";
import JSON5 from "json5";

/**
 * Workspace folder configuration from VS Code workspace file
 */
export interface WorkspaceFolder {
  path: string;
  name?: string;
}

/**
 * VS Code workspace file structure
 */
export interface WorkspaceConfig {
  folders: WorkspaceFolder[];
  settings?: Record<string, unknown>;
  extensions?: {
    recommendations?: string[];
  };
}

/**
 * Transforms workspace template content by:
 * 1. Resolving all relative paths (including ".") to absolute paths based on templateDir
 * 2. Inserting { "path": "." } as the first folder entry (which will resolve to subagent dir)
 * 
 * @param workspaceContent - JSON string content of the workspace file
 * @param templateDir - Absolute path to the directory containing the template file
 * @returns Transformed workspace JSON string with proper formatting
 * @throws Error if JSON is invalid or folders array is missing
 */
export function transformWorkspacePaths(workspaceContent: string, templateDir: string): string {
  let workspace: WorkspaceConfig;
  
  try {
    // Use JSON5 to parse VS Code workspace files (supports trailing commas, comments, etc.)
    workspace = JSON5.parse(workspaceContent) as WorkspaceConfig;
  } catch (error) {
    throw new Error(`Invalid workspace JSON: ${(error as Error).message}`);
  }

  if (!workspace.folders) {
    throw new Error("Workspace file must contain a 'folders' array");
  }

  if (!Array.isArray(workspace.folders)) {
    throw new Error("Workspace 'folders' must be an array");
  }

  // Transform all existing folders by resolving relative paths to absolute
  const transformedFolders = workspace.folders.map((folder) => {
    const folderPath = folder.path;
    
    // Check if path is already absolute
    if (path.isAbsolute(folderPath)) {
      return folder;
    }

    // Resolve relative path (including ".") to absolute based on template directory
    const absolutePath = path.resolve(templateDir, folderPath);
    
    return {
      ...folder,
      path: absolutePath,
    };
  });

  // Insert { "path": "." } as the first entry (will resolve to subagent directory)
  const updatedFolders = [
    { path: "." },
    ...transformedFolders,
  ];

  // Create the transformed workspace configuration
  const transformedWorkspace: WorkspaceConfig = {
    ...workspace,
    folders: updatedFolders,
  };

  // Return formatted JSON with 2-space indentation
  return JSON.stringify(transformedWorkspace, null, 2);
}
