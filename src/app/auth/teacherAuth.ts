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

    try {
      // normalize inputs
      const emailClean = email.trim().toLowerCase();

      const { data, error: authError } = await supabase.auth.signUp({
        email: emailClean,
        password: password.trim(),
        options: {
          data: {
            first_name: firstName?.trim(),
            middle_name: middleName?.trim(),
            last_name: lastName?.trim(),
            role: "teacher",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const user = data?.user;
      if (!user) {
        setError("Failed to retrieve user data");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert([
        {
          id: user.id,
          first_name: firstName?.trim(),
          middle_name: middleName?.trim(),
          last_name: lastName?.trim(),
          email: emailClean,
          created_at: new Date(),
        },
      ]);

      if (profileError) {
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
        setError(teacherError.message);
        return;
      }

      // create default quarters for the teacher
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
          // non-blocking
          console.error("Error creating quarters:", error.message);
        }
      };

      await createDefaultQuarters(user.id);

      router.push("/Dashboard");
    } finally {
      setLoading(false);
    }
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

    try {
      // normalize inputs
      const emailClean = email.trim().toLowerCase();
      const pw = password.trim();

      if (!emailClean || !pw) {
        setError("Please enter your email and password.");
        return false;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailClean,
        password: pw,
      });

      if (authError) {
        const msg = (authError.message || "").toLowerCase();
        if (msg.includes("invalid login")) {
          setError("The email or password you entered is incorrect.");
        } else if (msg.includes("email not confirmed")) {
          setError("Please verify your email, then try again.");
        } else if (msg.includes("rate limit")) {
          setError("Too many attempts. Please wait a minute and try again.");
        } else if (msg.includes("network")) {
          setError("Network error. Please check your connection and try again.");
        } else {
          setError("An error occurred while logging in. Please try again.");
        }
        return false;
      }

      const user = data?.user;
      if (!user) {
        setError("Failed to retrieve user data.");
        return false;
      }

      // Gate: must exist in teachers table
      const { data: teacherData, error: teacherError } = await supabase
        .from("teachers")
        .select("id")
        .eq("id", user.id)
        .single();

      if (teacherError || !teacherData) {
        setError("You are not authorized to access this dashboard.");
        return false;
      }

      return true;
    } catch (e) {
      console.error(e);
      setError("Unexpected error. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
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
