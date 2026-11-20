// The agent's version — one source of truth, shared with the packager
// (tools/package-agent.mjs) so the folder name, VERSION.txt and the log
// line all say the same thing.
import { version } from '../version.json';

export const AGENT_VERSION = version;
