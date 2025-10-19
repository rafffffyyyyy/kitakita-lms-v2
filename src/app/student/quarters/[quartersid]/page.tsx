"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Module {
  id: string;
  title: string;
  description: string;
  youtube_url?: string;
}

interface Student {
  id: string;
  teacher_id: string;
}

interface Quarter {
  id: string;
  name: string;
  teacher_id: string;
}

export default function StudentModuleViewPage() {
  const rawParams = useParams() ?? {};
  const router = useRouter();
  const quarterParam = rawParams["quarterId"];
  const quarterId = Array.isArray(quarterParam) ? quarterParam[0] : quarterParam;

  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState<boolean>(false);

  useEffect(() => {
    const fetchModules = async () => {
      if (!quarterId) return;

      setLoading(true);

      // Get current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Failed to get user");
        setLoading(false);
        return;
      }

      // Fetch student record for this user
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, teacher_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (studentError || !student) {
        setError("Student not found.");
        setLoading(false);
        return;
      }

      // Fetch quarter to check if it belongs to student's teacher
      const { data: quarter, error: quarterError } = await supabase
        .from("quarters")
        .select("id, name, teacher_id")
        .eq("id", quarterId)
        .limit(1)
        .maybeSingle();

      if (quarterError || !quarter) {
        setError("Quarter not found.");
        setLoading(false);
        return;
      }

      if (quarter.teacher_id !== student.teacher_id) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      setAuthorized(true); // ✅ Now authorized

      // Fetch modules
      const { data: moduleData, error: moduleError } = await supabase
        .from("modules")
        .select("id, title, description, youtube_url")
        .eq("quarter_id", quarterId);

      if (moduleError) {
        setError(moduleError.message);
      } else {
        setModules(moduleData || []);
      }

      setLoading(false);
    };

    fetchModules();
  }, [quarterId]);

  if (loading) return <p className="p-6">Loading modules...</p>;
  if (error) return <p className="p-6 text-red-500">Error: {error}</p>;
  if (!authorized)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          You are not authorized to view the modules for this quarter.
        </h1>
      </div>
    );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Modules for This Quarter</h1>

      {modules.length === 0 ? (
        <p>No modules available for this quarter.</p>
      ) : (
        <div className="grid gap-4">
          {modules.map((mod) => (
            <div
              key={mod.id}
              className="border p-4 rounded-md shadow hover:shadow-md transition"
            >
              <h2 className="text-xl font-semibold">{mod.title}</h2>
              <p className="text-gray-600">{mod.description}</p>

              <Link
                href={`/student/modules/${mod.id}`}
                className="text-blue-600 hover:underline mt-2 inline-block"
              >
                View Module
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
