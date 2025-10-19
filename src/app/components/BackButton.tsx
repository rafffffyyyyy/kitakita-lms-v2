"use client";

import { useRouter } from "next/navigation";
import { useUser } from "@/app/UserContext"; // this is okay

export default function BackButton() {
  const router = useRouter();
  const { role } = useUser(); // works for both roles

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      if (role === "teacher") {
        router.push("/teacherDashboard");
      } else if (role === "student") {
        router.push("/studentDashboard");
      } else {
        router.push("/");
      }
    }
  };

  return (
    <button
      onClick={handleBack}
      className="text-gray-700 hover:text-black p-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
        />
      </svg>
    </button>
  );
}
