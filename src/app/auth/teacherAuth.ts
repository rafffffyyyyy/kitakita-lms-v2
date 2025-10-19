// /auth/teacherAuth.ts
import { supabase } from "../../lib/supabase";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Teacher Sign-Up Hook
export const useTeacherSignUp = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          role: "teacher",
        },
      },
    });

    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    const user = data?.user;
    if (!user) {
      setLoading(false);
      setError("Failed to retrieve user data");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert([
      {
        id: user.id,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        email,
        created_at: new Date(),
      },
    ]);

    if (profileError) {
      setLoading(false);
      setError(profileError.message);
      return;
    }

    const { error: teacherError } = await supabase.from("teachers").insert([
      {
        id: user.id,
        created_at: new Date(),
      },
    ]);

    if (teacherError) {
      setLoading(false);
      setError(teacherError.message);
      return;
    }

    const createDefaultQuarters = async (teacherId: string) => {
      const quarters = ["1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];
      const { error } = await supabase.from("quarters").insert(
        quarters.map((name) => ({
          name,
          teacher_id: teacherId,
          created_at: new Date(),
        }))
      );
      if (error) {
        console.error("Error creating quarters:", error.message);
      }
    };

    await createDefaultQuarters(user.id);

    router.push("/Dashboard");
    setLoading(false);
  };

  return {
    firstName,
    setFirstName,
    lastName,
    setLastName,
    middleName,
    setMiddleName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    loading,
    error,
    handleSignUp,
  };
};

// Teacher Login Hook
export const useTeacherLogin = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (): Promise<boolean> => {
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.error("Auth error:", authError);
      setLoading(false);

      if (authError.message.includes("Invalid login credentials")) {
        setError("The email or password you entered is incorrect.");
      } else if (authError.message.includes("Network error")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError("An error occurred while logging in. Please try again.");
      }

      return false;
    }

    const user = data?.user;
    if (!user) {
      setError("Failed to retrieve user data.");
      setLoading(false);
      return false;
    }

    const { data: teacherData, error: teacherError } = await supabase
      .from("teachers")
      .select("*")
      .eq("id", user.id)
      .single();

    if (teacherError || !teacherData) {
      setError("You are not authorized to access this dashboard.");
      setLoading(false);
      return false;
    }

    setLoading(false);
    return true;
  };

  return {
    email,
    setEmail,
    password,
    setPassword,
    loading,
    error,
    handleLogin,
  };
};
