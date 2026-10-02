export type LmsAssignmentStatus = "open" | "submitted" | "closed";

export interface LmsAssignment {
  externalId: string;
  title: string;
  module: string;
  dueAt: string;
  description: string;
  source: string;
  status: LmsAssignmentStatus;
  url: string;
}

/** A future official LMS API adapter only needs to implement this contract. */
export interface LmsSource {
  id: string;
  label: string;
  listAssignments(): Promise<readonly LmsAssignment[]>;
}
