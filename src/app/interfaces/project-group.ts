/** A project inside a group, in the group's own order. */
export interface ProjectGroupMember {
  id: number;
  display_name: string;
  pin?: boolean;
  /**
   * Default share key of the member. Only returned by the owner endpoint `/project-groups/`;
   * never on project detail / share-key responses.
   */
  share_key?: string | null;
}

export interface ProjectGroup {
  id: number;
  display_name: string;
  /**
   * Ordered members. Present on GET /projects/{id}/, /projects/share-key/ and
   * /project-groups/{id}/; omitted on list rows (GET /projects/).
   */
  projects?: ProjectGroupMember[];
}
