import { tool } from "@opencode-ai/plugin"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { BackgroundManager } from "../../features/background-agent/manager"
import { log } from "../../shared/logger"

let backgroundManagerInstance: BackgroundManager | null = null
let directoryInstance: string | null = null
let currentPassthroughMode: boolean = false

export function initializeToggleOmoTool(
  backgroundManager: BackgroundManager,
  directory: string,
  passthroughMode: boolean
): void {
  backgroundManagerInstance = backgroundManager
  directoryInstance = directory
  currentPassthroughMode = passthroughMode
}

function getUserConfigDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
}

function getProjectConfigPath(directory: string): string {
  return path.join(directory, ".opencode", "oh-my-opencode.json")
}

function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), "opencode", "oh-my-opencode.json")
}

function updateConfigFile(configPath: string, passthroughMode: boolean): void {
  try {
    let config: Record<string, unknown> = {}
    
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8")
      config = JSON.parse(content)
    } else {
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
    
    config.passthrough_mode = passthroughMode
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
    log(`Updated config file: ${configPath}`, { passthrough_mode: passthroughMode })
  } catch (error) {
    log(`Failed to update config file: ${configPath}`, error)
    throw new Error(`Failed to persist toggle state: ${error}`)
  }
}

export const toggleOmoTool = tool({
  description: `Toggle Oh-My-Opencode mode for the NEXT session.

**IMPORTANT**: This tool only updates the configuration file. Changes take effect after restarting OpenCode.

**What this does**:
- Updates passthrough_mode in oh-my-opencode.json
- When passthrough_mode=true: Next session will use vanilla OpenCode (no Oh-My-Opencode features)
- When passthrough_mode=false: Next session will use Oh-My-Opencode (all features enabled)

**Behavior**:
- Blocks if background agents are currently running (prevents saving during active work)
- Persists to config file (project config if exists, otherwise user config)
- Provides instructions to restart OpenCode

**When to use**:
- User wants to switch modes for their next OpenCode session
- User wants to test behavior with/without Oh-My-Opencode
- User wants to disable Oh-My-Opencode temporarily without uninstalling

**Current session**: Changes do NOT affect the current session - only the next one after restart.`,

  args: {},

  async execute() {
    if (!backgroundManagerInstance || !directoryInstance) {
      return "❌ Toggle not initialized properly. This is a bug."
    }

    // Check for running background agents
    const runningTasks = Array.from((backgroundManagerInstance as any).tasks.values() as Map<string, any>)
      .filter((task: any) => task.status === "running")
    
    if (runningTasks.length > 0) {
      const taskDescriptions = runningTasks
        .map((t: any) => `  • ${t.description} (${t.agent})`)
        .join("\n")
      
      return `❌ **Cannot toggle Oh-My-Opencode mode**

**Reason**: ${runningTasks.length} background agent${runningTasks.length > 1 ? "s" : ""} currently running

**Running tasks**:
${taskDescriptions}

**Action required**: 
- Wait for background tasks to complete, or
- Cancel them with \`background_cancel(all=true)\`

Then try again.`
    }
    
    // Toggle the mode for next session
    const newPassthroughMode = !currentPassthroughMode
    
    // Persist to config file
    const projectConfigPath = getProjectConfigPath(directoryInstance)
    const userConfigPath = getUserConfigPath()
    
    const targetConfigPath = fs.existsSync(projectConfigPath) 
      ? projectConfigPath 
      : userConfigPath
    
    try {
      updateConfigFile(targetConfigPath, newPassthroughMode)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return `❌ **Failed to update configuration**\n\n**Error**: ${errorMessage}`
    }
    
    // Generate feedback
    if (newPassthroughMode) {
      // Will be vanilla mode next session
      return `✅ **Configuration updated: Vanilla OpenCode mode**

**Current session**: Oh-My-Opencode features remain **active** in this session
  • All agents, tools, hooks, and MCPs continue to work normally
  • This toggle only affects the NEXT session

**Next session (after restart)**: Vanilla OpenCode mode will be enabled
  • ❌ All Oh-My-Opencode agents will be disabled
  • ❌ All enhanced tools will be unavailable
  • ❌ All hooks will be inactive
  • ❌ All MCPs will be disabled
  • ✅ Standard OpenCode agents (build, plan) will work
  • ✅ Core OpenCode features will work

**Configuration saved to**: \`${targetConfigPath}\`

**To apply changes**: Restart OpenCode (exit and run \`opencode\` again)

**To switch back**: Use this tool again to re-enable Oh-My-Opencode features.`
    } else {
      // Will have Oh-My-Opencode enabled next session
      return `✅ **Configuration updated: Oh-My-Opencode enabled**

**Current session**: Changes will **not** apply to this session
  • Current mode remains as-is until restart
  • This toggle only affects the NEXT session

**Next session (after restart)**: Oh-My-Opencode features will be enabled
  • ✅ 7 specialized agents available
  • ✅ Enhanced tools (LSP, AST-grep, look_at, etc.)
  • ✅ 15+ smart hooks
  • ✅ 3 MCPs (context7, websearch_exa, grep_app)
  • ✅ Full Claude Code compatibility

**Configuration saved to**: \`${targetConfigPath}\`

**To apply changes**: Restart OpenCode (exit and run \`opencode\` again)

**To switch back**: Use this tool again to disable Oh-My-Opencode features.`
    }
  },
})
