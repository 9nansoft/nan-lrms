// Side-effect entry import for nn-lrms-agent so Node 18.5.0's experimental
// global fetch is replaced with node:http / node:https before any module runs.
import { installNodeFetch } from './node-fetch';

installNodeFetch();
