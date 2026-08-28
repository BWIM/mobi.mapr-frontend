export interface ProjectGroupSibling {
  id: number;
  display_name: string;
  pin?: boolean;
  share_key?: string | null;
}

export interface ProjectGroup {
  id: number;
  display_name: string;
  /** Present on detail, share-key, and GET /project-groups/{id}/; omitted on list rows. */
  projects?: ProjectGroupSibling[];
}
