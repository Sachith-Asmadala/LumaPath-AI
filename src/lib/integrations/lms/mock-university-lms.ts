import { scenarioAt } from "../../demo-data/scenario";
import type { LmsAssignment, LmsSource } from "./types";

export const mockUniversityLmsId = "mock-university-lms";

const assignments: readonly LmsAssignment[] = [
  {
    externalId: "db-systems-assignment-1",
    title: "Database Assignment",
    module: "Database Systems",
    dueAt: scenarioAt(8, "23:59:00"),
    description: "Submit the query plan, indexing discussion, and final database report.",
    source: mockUniversityLmsId,
    status: "open",
    url: "https://lms.example.invalid/assignments/db-systems-assignment-1",
  },
  {
    externalId: "networks-lab-2",
    title: "Network Security Lab",
    module: "Computer Networks",
    dueAt: scenarioAt(3, "17:00:00"),
    description: "Document packet-filtering rules and submit the completed lab worksheet.",
    source: mockUniversityLmsId,
    status: "open",
    url: "https://lms.example.invalid/assignments/networks-lab-2",
  },
  {
    externalId: "cloud-architecture-report",
    title: "Cloud Architecture Report",
    module: "Cloud Computing",
    dueAt: scenarioAt(11, "23:59:00"),
    description: "Compare deployment options and explain the chosen reliability design.",
    source: mockUniversityLmsId,
    status: "open",
    url: "https://lms.example.invalid/assignments/cloud-architecture-report",
  },
];

export const mockUniversityLms: LmsSource = {
  id: mockUniversityLmsId,
  label: "University LMS (demo)",
  async listAssignments() {
    return assignments.map((assignment) => ({ ...assignment }));
  },
};
