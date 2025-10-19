export type QuarterOpt = { id: string; name: string };
export type ModuleOpt  = { id: string; title: string; quarter_id: string };
export type AssignmentOpt = { id: string; name: string; module_id: string; max_score?: number | null };

export type RosterStudent = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  section_id: number | null;
};

export type LatestSubmission = {
  id: string;
  assignment_id: string;
  student_id: string;
  answer_text: string | null;
  file_url: string | null;
  grade: number | null;
  feedback: string | null;
  submitted_at: string | null;
};

export type AssignmentDataset = {
  roster: RosterStudent[];
  latestSubmissions: LatestSubmission[];
  metrics: {
    submitted: number;
    notSubmitted: number;
    graded: number;
    avgScore: number | null;
  };
  debug: {
    t_ms: number;                    // server timing
    rows: { roster: number; subs: number };
  };
};
