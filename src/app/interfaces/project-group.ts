export interface ProjectGroupSibling {
  id: number;
  display_name: string;
  share_key?: string | null;
}

export interface ProjectGroup {
  id: number;
  display_name: string;
  projects: ProjectGroupSibling[];
}
