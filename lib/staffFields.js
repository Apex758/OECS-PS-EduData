// Safe (non-PII) staff columns — shared by server ingest and client push shaping.
export const STAFF_SAFE_FIELDS = [
  "institution", "territory", "classification", "teacher_type", "subjects",
  "total_periods", "years_experience", "highest_qualification",
  "area_of_specialisation", "cpd_hours", "appraised", "left_service", "sex",
];
