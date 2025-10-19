"use client";
import BackButton from "@/app/components/BackButton";

type ModuleHeaderProps = { title: string };

export default function ModuleHeader({ title }: ModuleHeaderProps) {
  return (
    <div>
      <div className="flex items-center justify-start mb-4">
        <BackButton />
        <h1 className="text-2xl font-bold text-gray-800 ml-2">{title}</h1>
      </div>
    </div>
  );
}
