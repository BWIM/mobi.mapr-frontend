export interface ProjectGroupSibling {
  id: number;
  display_name: string;
}

export interface ProjectGroup {
  id: number;
  display_name: string;
  projects: ProjectGroupSibling[];
}
