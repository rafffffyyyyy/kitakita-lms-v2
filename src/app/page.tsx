"use client";

import { useState } from "react";
import Image from "next/image"; // ✅ Import Next.js Image
import TeacherSignInModal from "./components/TeacherSignInModal";
import StudentLoginModal from "./components/StudentLogInModal";
import AdminSignInModal from "./components/AdminSignInModal";

export default function Home() {
  const [isTeacherSignInOpen, setIsTeacherSignInOpen] = useState(false);
  const [isStudentLoginOpen, setIsStudentLoginOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);

  const openTeacherSignIn = () => setIsTeacherSignInOpen(true);
  const openStudentLogin = () => setIsStudentLoginOpen(true);
  const openAdminLogin = () => setIsAdminLoginOpen(true);

  const closeModal = () => {
    setIsTeacherSignInOpen(false);
    setIsStudentLoginOpen(false);
    setIsAdminLoginOpen(false);
  };

  // 🔹 Card component with icon
  const RoleCard = ({
  onClick,
  label,
  iconSrc,
}: {
  onClick: () => void;
  label: string;
  iconSrc: string;
}) => (
  <button
    onClick={onClick}
    className="
      relative w-80 h-52 overflow-hidden
      rounded-2xl border border-gray-200
      bg-white/80 backdrop-blur
      shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition
      focus:outline-none focus:ring-2 focus:ring-slate-900/20
    "
    aria-label={label}
  >
    {/* BIG icon fills the card with padding */}
    <div className="absolute inset-0 p-5">
      <Image
        src={iconSrc}
        alt={`${label} icon`}
        fill
        className="object-contain"
        sizes="256px"
        priority={true}
      />
    </div>

    {/* Label stays on top, higher precedence */}
    <div
      className="
        absolute bottom-1 left-1/2 -translate-x-1/2
        px-3 py-1 rounded-full
        bg-white/90 backdrop-blur
        text-gray-900 text-sm font-semibold
        ring-1 ring-black/5
      "
    >
      {label}
    </div>
  </button>
);

  return (
    <div className="relative min-h-screen">
      {/* Background logo (50% opacity) */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-20 blur-sm bg-center bg-no-repeat bg-contain"
        style={{ backgroundImage: "url(/images/KHS/KHS.png)" }}
      />

      <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
        <div className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Admin */}
            <RoleCard
              onClick={openAdminLogin}
              label="Admin"
              iconSrc="/images/KHS/admin.png"
            />

            {/* Teacher */}
            <RoleCard
              onClick={openTeacherSignIn}
              label="Teacher"
              iconSrc="/images/KHS/teacher.png"
            />

            {/* Student */}
            <RoleCard
              onClick={openStudentLogin}
              label="Student"
              iconSrc="/images/KHS/student.png"
            />
          </div>

          {/* Modals */}
          {isAdminLoginOpen && <AdminSignInModal closeModal={closeModal} />}

          {isTeacherSignInOpen && (
            <TeacherSignInModal
              closeModal={closeModal}
              switchToSignUp={() => {}}
              onLoginSuccess={() => {
                window.location.href = "/Dashboard";
              }}
            />
          )}

          {isStudentLoginOpen && (
            <StudentLoginModal
              closeModal={closeModal}
              onLoginSuccess={() => {
                window.location.href = "/Dashboard";
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
