/**
 * Isolation for eval cells.
 *
 * Every generator or judge cell used to run with `env: { ...process.env, CODEX_HOME: codexHome }`,
 * which left `HOME` inherited: the CLI resolved `~/.agents/skills`, `~/.claude` and `~/.codex`
 * against the author's account, so the "no skill" arm could still read an architecture skill
 * installed there. This module builds the only environment a cell is allowed to see: a fresh
 * `HOME`, a fresh `CODEX_HOME`, no variable that points back at the author's configuration, and
 * no configuration-bearing variable whose value still contains the real home directory.
 *
 * `PATH` is left intact. It decides which executables are found, not which configuration is
 * read, and stripping its home-owned entries broke CLIs installed through nvm, npm prefix or
 * bun: an absolute `codex` path was still found, but its `#!/usr/bin/env node` no longer was.
 * `resolveCommand()` remains for callers that want an absolute path regardless.
 */
import { accessSync, constants } from 'node:fs'
import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

/** Variables that would send a CLI back to the author's configuration or session. */
export const USER_CONFIG_ENV_KEYS = [
  'CODEX_HOME',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_HOME',
  'CLAUDE_CODE_CONFIG_DIR',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDECODE',
  'CLAUDE_EFFORT',
  'CLAUDE_PID',
  'AGENTS_HOME',
  'AGENT_SKILLS_DIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  'XDG_STATE_HOME',
  'XDG_RUNTIME_DIR',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'NPM_CONFIG_PREFIX',
  'npm_config_prefix',
  'PNPM_HOME',
  'BUN_INSTALL',
  'ZDOTDIR',
  'FPATH',
  'INFOPATH',
]

/** The directories a leaked variable could point at: the parent's own home, by both spellings. */
function realHomes(base) {
  return [base.HOME, base.USERPROFILE, homedir()].filter((value) => typeof value === 'string' && value.length > 1)
}


/**
 * Build the environment for one eval cell.
 *
 * @param {{home: string, codexHome: string, base?: Record<string, string|undefined>}} options
 * @returns {Record<string, string>} env with a fresh HOME/CODEX_HOME and no path back to the author
 */
export function buildCellEnv({ home, codexHome, base = process.env }) {
  if (!home || !isAbsolute(home)) throw new Error('buildCellEnv requires an absolute home')
  if (!codexHome || !isAbsolute(codexHome)) throw new Error('buildCellEnv requires an absolute codexHome')
  const homes = realHomes(base)
  const env = {}
  for (const [key, value] of Object.entries(base)) {
    if (typeof value !== 'string') continue
    if (USER_CONFIG_ENV_KEYS.includes(key)) continue
    env[key] = value
  }
  // Anything left that still names the author's home is dropped rather than rewritten: a cell has
  // no business reading a path under it, whatever the variable is called. PATH is the one
  // exception, for the reason above.
  for (const [key, value] of Object.entries(env)) {
    if (key === 'PATH') continue
    if (homes.some((real) => value.includes(real))) delete env[key]
  }
  env.HOME = home
  env.USERPROFILE = home
  env.CODEX_HOME = codexHome
  env.TMPDIR = join(home, 'tmp')
  return env
}

/** Resolve a command name against the parent's PATH, so a stripped PATH cannot hide it. */
export function resolveCommand(name, base = process.env) {
  if (name.includes('/')) return name
  for (const entry of (base.PATH ?? '').split(delimiter)) {
    if (!entry) continue
    const candidate = join(entry, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // next entry
    }
  }
  return name
}

async function linkIfPresent(source, target) {
  try {
    await mkdir(join(target, '..'), { recursive: true })
    await symlink(await realpath(source), target)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      process.stdout.write(`isolation: no ${source} to link; the cell runs without it\n`)
      return
    }
    if (error?.code !== 'EEXIST') throw error
  }
}

/**
 * Create the throwaway HOME an eval run uses. Credentials are the only thing carried over from the
 * author's account, and they are linked as files rather than reached through the environment.
 *
 * @param {string} prefix mkdtemp prefix
 */
export async function createEvalSandbox(prefix) {
  const base = await mkdtemp(join(tmpdir(), prefix))
  const home = join(base, 'home')
  const codexHome = join(home, '.codex')
  await mkdir(join(home, 'tmp'), { recursive: true })
  await mkdir(codexHome, { recursive: true })
  await linkIfPresent(join(homedir(), '.codex', 'auth.json'), join(codexHome, 'auth.json'))
  await linkIfPresent(join(homedir(), '.claude', '.credentials.json'), join(home, '.claude', '.credentials.json'))
  return { base, home, codexHome }
}
