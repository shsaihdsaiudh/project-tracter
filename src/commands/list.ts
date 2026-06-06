import { formatProjectList } from '../lib/formatter.js';
import { listProjects } from '../lib/config.js';

export function listCommand(): void {
  const projects = listProjects();

  if (projects.length === 0) {
    console.log(formatProjectList([]));
  } else {
    console.log(formatProjectList(projects));
  }
}
