// /lib/types/module.ts
export type ModuleRow = {
  id: string;
  quarter_id: string;
  title: string;
  description: string | null;
  created_at?: string;
  thumbnail_url: string | null; // <-- required
};
